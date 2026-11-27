import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { db } from '@/lib/db';
import {
  billingConfigured,
  stripeClient,
  subscriptionStatus,
  tierForAnyPrice,
  verifyStripeWebhook,
} from '@/lib/billing';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  if (!billingConfigured())
    return NextResponse.json({ error: 'billingUnavailable' }, { status: 503 });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 1000000)
    return NextResponse.json({ error: 'invalid' }, { status: 413 });
  let event: Stripe.Event;
  try {
    event = verifyStripeWebhook(
      raw,
      req.headers.get('stripe-signature') || '',
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  try {
    if (await db.webhookEvent.findUnique({ where: { id: event.id } }))
      return NextResponse.json({ received: true });
    const stripe = stripeClient();
    if (
      [
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
      ].includes(event.type)
    ) {
      const source = event.data.object as Stripe.Subscription;
      // Fetch canonical state so an out-of-order delivery cannot reinstate stale access.
      const subscription = await stripe.subscriptions.retrieve(source.id);
      const userId = subscription.metadata.userId,
        tier = await tierForAnyPrice(subscription.items.data[0]?.price.id || '');
      const user = userId ? await db.user.findUnique({ where: { id: userId } }) : null;
      if (user) {
        const permittedTier = tier && (tier !== 'COACH' || user.role === 'COACH') ? tier : 'FREE';
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;
        const end = subscription.items.data[0]?.current_period_end;
        const data = {
          provider: 'stripe',
          providerId: subscription.id,
          customerId,
          tier: permittedTier,
          status: permittedTier === 'FREE' ? 'INACTIVE' : subscriptionStatus(subscription.status),
          currentPeriodEnd: end ? new Date(end * 1000) : null,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
        };
        await db.$transaction(async (tx) => {
          if (await tx.webhookEvent.findUnique({ where: { id: event.id } })) return;
          await tx.subscription.upsert({
            where: { userId },
            create: { userId, ...data },
            update: data,
          });
          await tx.webhookEvent.create({ data: { id: event.id, type: event.type } });
        });
        return NextResponse.json({ received: true });
      }
    }
    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice,
        customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      const local = customerId ? await db.subscription.findUnique({ where: { customerId } }) : null;
      // A customer event may arrive before subscription.created. Ask Stripe to retry.
      if (!local) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
      const canonical = await stripe.invoices.retrieve(invoice.id!);
      await db.$transaction(async (tx) => {
        if (await tx.webhookEvent.findUnique({ where: { id: event.id } })) return;
        await tx.payment.upsert({
          where: { id: canonical.id! },
          create: {
            id: canonical.id!,
            userId: local.userId,
            amount: canonical.amount_paid,
            currency: canonical.currency,
            status: canonical.status || 'open',
            invoiceUrl: canonical.hosted_invoice_url || null,
          },
          update: {
            amount: canonical.amount_paid,
            status: canonical.status || 'open',
            invoiceUrl: canonical.hosted_invoice_url || null,
          },
        });
        await tx.webhookEvent.create({ data: { id: event.id, type: event.type } });
      });
      return NextResponse.json({ received: true });
    }
    await db.webhookEvent.create({ data: { id: event.id, type: event.type } });
    return NextResponse.json({ received: true });
  } catch {
    console.error(
      JSON.stringify({ event: 'billing_webhook_failed', eventId: event.id, type: event.type }),
    );
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
