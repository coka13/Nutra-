import Stripe from 'stripe';
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
