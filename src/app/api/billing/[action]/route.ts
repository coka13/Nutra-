import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, audit, rateLimit, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { billingConfigured, priceForTier, stripeClient } from '@/lib/billing';
import { acceptsOrigin } from '@/lib/request-origin';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const u = await requireUser();
    return NextResponse.json(
      {
        configured: billingConfigured(),
        payments: await db.payment.findMany({
          where: { userId: u.id },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  try {
    if (!acceptsOrigin(req))
      throw new ApiError('forbidden', 403);
    const u = await requireUser();
    await rateLimit(`billing:${u.id}`, 5);
    if (!billingConfigured()) throw new ApiError('billingUnavailable', 503);
    const stripe = stripeClient(),
      action = (await params).action,
      appUrl = process.env.APP_URL!.replace(/\/$/, '');
    if (action === 'checkout') {
      const { tier } = z.object({ tier: z.enum(['PREMIUM', 'COACH']) }).parse(await req.json());
      if (tier === 'COACH' && u.role !== 'COACH') throw new ApiError('forbidden', 403);
      if (u.subscription?.providerId && u.subscription.status === 'ACTIVE')
        throw new ApiError('subscriptionActive', 409);
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          line_items: [{ price: priceForTier(tier)!, quantity: 1 }],
          success_url: `${appUrl}/app/billing?checkout=returned`,
          cancel_url: `${appUrl}/app/billing`,
          client_reference_id: u.id,
          locale: u.language === 'he' ? 'he' : 'en',
          ...(u.subscription?.customerId
            ? { customer: u.subscription.customerId }
            : { customer_email: u.email }),
          subscription_data: { metadata: { userId: u.id, tier } },
          metadata: { userId: u.id, tier },
        },
        { idempotencyKey: `checkout:${u.id}:${Math.floor(Date.now() / 300000)}` },
      );
      if (!session.url?.startsWith('https://checkout.stripe.com/'))
        throw new ApiError('billingUnavailable', 503);
      await audit(u.id, 'billing/checkout_created');
      return NextResponse.json({ url: session.url });
    }
    if (action === 'portal') {
      if (!u.subscription?.customerId) throw new ApiError('invalid');
      const session = await stripe.billingPortal.sessions.create({
        customer: u.subscription.customerId,
        return_url: `${appUrl}/app/billing`,
      });
      if (!session.url.startsWith('https://billing.stripe.com/'))
        throw new ApiError('billingUnavailable', 503);
      return NextResponse.json({ url: session.url });
    }
    throw new ApiError('notFound', 404);
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.code }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    return NextResponse.json({ error: 'billingUnavailable' }, { status: 503 });
  }
}
