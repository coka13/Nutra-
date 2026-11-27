import type { Prisma } from '@prisma/client';
import { paypalStatus, tierForPaypalPlan, type PaypalSubscription } from './paypal';

/**
 * Stores PayPal's canonical subscription state for its owner. Used by the verified webhook
 * and by the return from PayPal, so paid access (and the end of ads) starts immediately.
 */
export async function applyPaypalSubscription(
  tx: Prisma.TransactionClient,
  user: { id: string; role: string },
  subscription: PaypalSubscription,
) {
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
  return status;
}
