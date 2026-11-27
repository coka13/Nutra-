import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  getPaypalSubscription,
  paypalConfigured,
  paypalStatus,
  tierForPaypalPlan,
  verifyPaypalWebhook,
} from '@/lib/paypal';
export const runtime = 'nodejs';

const eventSchema = z.object({
  id: z.string().min(1).max(200),
  event_type: z.string().max(200),
  resource: z.record(z.string(), z.unknown()),
});

export async function POST(req: NextRequest) {
  if (!paypalConfigured())
    return NextResponse.json({ error: 'billingUnavailable' }, { status: 503 });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 1000000)
    return NextResponse.json({ error: 'invalid' }, { status: 413 });
  let event: z.infer<typeof eventSchema>;
  try {
    event = eventSchema.parse(JSON.parse(raw));
    if (!(await verifyPaypalWebhook(req.headers, JSON.parse(raw))))
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const eventId = `paypal:${event.id}`;
  try {
    if (await db.webhookEvent.findUnique({ where: { id: eventId } }))
      return NextResponse.json({ received: true });

    if (event.event_type.startsWith('BILLING.SUBSCRIPTION.')) {
      // Fetch canonical state so an out-of-order delivery cannot reinstate stale access.
      const subscription = await getPaypalSubscription(String(event.resource.id ?? ''));
      const userId = subscription.custom_id;
      const user = userId ? await db.user.findUnique({ where: { id: userId } }) : null;
      if (user) {
        const tier = tierForPaypalPlan(subscription.plan_id);
        const permittedTier = tier && (tier !== 'COACH' || user.role === 'COACH') ? tier : 'FREE';
        const status = permittedTier === 'FREE' ? 'INACTIVE' : paypalStatus(subscription.status);
        const next = subscription.billing_info?.next_billing_time;
        const data = {
          provider: 'paypal',
          providerId: subscription.id,
          customerId: null,
          tier: permittedTier,
          status,
          currentPeriodEnd: next ? new Date(next) : null,
          cancelAtPeriodEnd: false,
          canceledAt:
            status === 'CANCELLED' && subscription.status_update_time
              ? new Date(subscription.status_update_time)
              : null,
        };
        await db.$transaction(async (tx) => {
          if (await tx.webhookEvent.findUnique({ where: { id: eventId } })) return;
          const current = await tx.subscription.findUnique({ where: { userId: user.id } });
          // Never let a pending or ended PayPal subscription override another active one.
          const otherActive =
            current?.status === 'ACTIVE' &&
            current.providerId &&
            current.providerId !== subscription.id &&
            status !== 'ACTIVE';
          if (!otherActive)
            await tx.subscription.upsert({
              where: { userId: user.id },
              create: { userId: user.id, ...data },
              update: data,
            });
          await tx.webhookEvent.create({ data: { id: eventId, type: event.event_type } });
        });
        return NextResponse.json({ received: true });
      }
    }

    if (event.event_type === 'PAYMENT.SALE.COMPLETED') {
      const sale = event.resource as {
        id?: string;
        billing_agreement_id?: string;
        state?: string;
        amount?: { total?: string; currency?: string };
      };
      const local = sale.billing_agreement_id
        ? await db.subscription.findUnique({ where: { providerId: sale.billing_agreement_id } })
        : null;
      // A payment may arrive before the subscription activation. Ask PayPal to retry.
      if (!local) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
      const amount = Math.round(Number(sale.amount?.total ?? 0) * 100);
      const id = `paypal_${sale.id}`;
      const status = 'paid';
      await db.$transaction(async (tx) => {
        if (await tx.webhookEvent.findUnique({ where: { id: eventId } })) return;
        await tx.payment.upsert({
          where: { id },
          create: {
            id,
            userId: local.userId,
            amount,
            currency: (sale.amount?.currency || 'USD').toLowerCase(),
            status,
          },
          update: { status },
        });
        await tx.webhookEvent.create({ data: { id: eventId, type: event.event_type } });
      });
      return NextResponse.json({ received: true });
    }

    await db.webhookEvent.create({ data: { id: eventId, type: event.event_type } });
    return NextResponse.json({ received: true });
  } catch {
    console.error(
      JSON.stringify({ event: 'billing_webhook_failed', eventId, type: event.event_type }),
    );
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
