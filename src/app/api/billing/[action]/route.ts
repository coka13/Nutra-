import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, audit, rateLimit, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { billingConfigured, checkoutPriceForTier, stripeClient } from '@/lib/billing';
import { acceptsOrigin } from '@/lib/request-origin';
import {
  cancelPaypalSubscription,
  createPaypalSubscription,
  getPaypalSubscription,
  paypalConfigured,
  paypalStatus,
} from '@/lib/paypal';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const u = await requireUser();
    return NextResponse.json(
      {
        configured: billingConfigured() || paypalConfigured(),
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
    const action = (await params).action;
    const activePaid = !!u.subscription?.providerId && u.subscription.status === 'ACTIVE';
    // PayPal (web): hosted approval page; access is granted only by the verified webhook.
    if (action === 'paypal') {
      if (!paypalConfigured()) throw new ApiError('billingUnavailable', 503);
      const { tier } = z.object({ tier: z.enum(['PREMIUM', 'COACH']) }).parse(await req.json());
      if (tier === 'COACH' && u.role !== 'COACH') throw new ApiError('forbidden', 403);
      if (activePaid) throw new ApiError('subscriptionActive', 409);
      const url = await createPaypalSubscription(u, tier);
      await audit(u.id, 'billing/paypal_checkout_created');
      return NextResponse.json({ url });
    }
    if (action === 'paypal-cancel') {
      if (!paypalConfigured()) throw new ApiError('billingUnavailable', 503);
      const id = u.subscription?.provider === 'paypal' ? u.subscription.providerId : null;
      if (!id) throw new ApiError('invalid');
      await cancelPaypalSubscription(id);
      // Reflect PayPal's canonical state now; the webhook confirms it as well.
      const canonical = await getPaypalSubscription(id);
      await db.subscription.update({
        where: { userId: u.id },
        data: { status: paypalStatus(canonical.status), canceledAt: new Date() },
      });
      await audit(u.id, 'billing/paypal_cancelled');
      return NextResponse.json({ ok: true });
    }
    if (!billingConfigured()) throw new ApiError('billingUnavailable', 503);
    const stripe = stripeClient(),
      appUrl = process.env.APP_URL!.replace(/\/$/, '');
    // Card checkout (Stripe). Apple Pay and Google Pay appear on supported devices once
    // they are enabled in the Stripe dashboard; mobile opens it in the system browser.
    if (action === 'checkout') {
      const { tier } = z.object({ tier: z.enum(['PREMIUM', 'COACH']) }).parse(await req.json());
      if (tier === 'COACH' && u.role !== 'COACH') throw new ApiError('forbidden', 403);
      if (activePaid) throw new ApiError('subscriptionActive', 409);
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          line_items: [{ price: (await checkoutPriceForTier(tier))!, quantity: 1 }],
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
