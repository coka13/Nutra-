import Stripe from 'stripe';
import { getConfig } from './remote-config';
export function billingConfigured() {
  return !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.STRIPE_PRICE_PREMIUM &&
    process.env.STRIPE_PRICE_COACH &&
    process.env.STRIPE_PRICE_PREMIUM !== process.env.STRIPE_PRICE_COACH &&
    process.env.APP_URL
  );
}
export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('billingUnavailable');
  return new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20000 });
}
export function priceForTier(tier: 'PREMIUM' | 'COACH') {
  return tier === 'COACH' ? process.env.STRIPE_PRICE_COACH : process.env.STRIPE_PRICE_PREMIUM;
}
export function tierForPrice(price: string) {
  if (price && price === process.env.STRIPE_PRICE_COACH) return 'COACH';
  if (price && price === process.env.STRIPE_PRICE_PREMIUM) return 'PREMIUM';
  return null;
}
export function subscriptionStatus(status: string) {
  return status === 'active' || status === 'trialing'
    ? 'ACTIVE'
    : status === 'past_due'
      ? 'PAST_DUE'
      : status === 'canceled'
        ? 'CANCELLED'
        : 'INACTIVE';
}
export function verifyStripeWebhook(payload: string, signature: string, secret: string) {
  return new Stripe('sk_test_verification_only').webhooks.constructEvent(
    payload,
    signature,
    secret,
  );
}

/** Checkout price: an administrator-set Stripe price ID, else the environment default. */
export async function checkoutPriceForTier(tier: 'PREMIUM' | 'COACH') {
  const { plans } = await getConfig();
  return plans.stripePriceIds[tier] || priceForTier(tier);
}
/** Maps both current and previous (environment) prices so existing subscribers keep access. */
export async function tierForAnyPrice(price: string) {
  const known = tierForPrice(price);
  if (known || !price) return known;
  const { plans } = await getConfig();
  if (price === plans.stripePriceIds.COACH) return 'COACH';
  if (price === plans.stripePriceIds.PREMIUM) return 'PREMIUM';
  return null;
}
