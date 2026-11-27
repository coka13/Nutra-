/**
 * PayPal Subscriptions adapter (web checkout).
 * Disabled until every PAYPAL_* value is set. Like Stripe, access is granted only from
 * verified webhooks re-checked against PayPal's canonical subscription state; the return
 * URL never grants access. No payment details enter Fitura+.
 */
type Tier = 'PREMIUM' | 'COACH';

export function paypalConfigured() {
  return !!(
    process.env.PAYPAL_CLIENT_ID &&
    process.env.PAYPAL_CLIENT_SECRET &&
    process.env.PAYPAL_WEBHOOK_ID &&
    process.env.PAYPAL_PLAN_PREMIUM &&
    process.env.PAYPAL_PLAN_COACH &&
    process.env.PAYPAL_PLAN_PREMIUM !== process.env.PAYPAL_PLAN_COACH &&
    process.env.APP_URL
  );
}

const live = () => process.env.PAYPAL_ENV === 'live';
const apiBase = () => (live() ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');
const approvalHost = () => (live() ? 'https://www.paypal.com/' : 'https://www.sandbox.paypal.com/');

export const paypalPlanForTier = (tier: Tier) =>
  tier === 'COACH' ? process.env.PAYPAL_PLAN_COACH! : process.env.PAYPAL_PLAN_PREMIUM!;
export function tierForPaypalPlan(planId: string): Tier | null {
  if (planId && planId === process.env.PAYPAL_PLAN_COACH) return 'COACH';
  if (planId && planId === process.env.PAYPAL_PLAN_PREMIUM) return 'PREMIUM';
  return null;
}

/** Maps PayPal subscription states to the local subscription status. */
export function paypalStatus(status: string) {
  return status === 'ACTIVE'
    ? 'ACTIVE'
    : status === 'SUSPENDED'
      ? 'PAST_DUE'
      : status === 'CANCELLED' || status === 'EXPIRED'
        ? 'CANCELLED'
        : 'INACTIVE';
}

async function accessToken() {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString('base64');
  const response = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('billingUnavailable');
  return ((await response.json()) as { access_token: string }).access_token;
}

async function paypal<T>(path: string, init: { method?: string; body?: unknown; requestId?: string } = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      ...(init.requestId && { 'PayPal-Request-Id': init.requestId }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('billingUnavailable');
  return (response.status === 204 ? null : await response.json()) as T;
}

export type PaypalSubscription = {
  id: string;
  status: string;
  plan_id: string;
  custom_id?: string;
  billing_info?: { next_billing_time?: string };
  status_update_time?: string;
};

/** Creates a pending subscription and returns PayPal's approval URL. */
export async function createPaypalSubscription(user: {
  id: string;
  email: string;
  language: string;
}, tier: Tier) {
  const appUrl = process.env.APP_URL!.replace(/\/$/, '');
  const result = await paypal<{ id: string; links: { rel: string; href: string }[] }>(
    '/v1/billing/subscriptions',
    {
      method: 'POST',
      // Same idempotency window as Stripe checkout: repeated clicks reuse one subscription.
      requestId: `checkout-${user.id}-${tier}-${Math.floor(Date.now() / 300000)}`,
      body: {
        plan_id: paypalPlanForTier(tier),
        custom_id: user.id,
        subscriber: { email_address: user.email },
        application_context: {
          brand_name: 'Fitura+',
          locale: user.language === 'he' ? 'he-IL' : 'en-US',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'SUBSCRIBE_NOW',
          return_url: `${appUrl}/app/billing?checkout=returned`,
          cancel_url: `${appUrl}/app/billing`,
        },
      },
    },
  );
  const url = result.links.find((link) => link.rel === 'approve')?.href;
  if (!url?.startsWith(approvalHost())) throw new Error('billingUnavailable');
  return url;
}

export const getPaypalSubscription = (id: string) =>
  paypal<PaypalSubscription>(`/v1/billing/subscriptions/${encodeURIComponent(id)}`);

export const cancelPaypalSubscription = (id: string) =>
  paypal(`/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: { reason: 'Cancelled from Fitura+ billing' },
  });

/** Verifies a webhook delivery with PayPal's signature verification API. */
export async function verifyPaypalWebhook(headers: Headers, event: unknown) {
  const header = (name: string) => headers.get(name) || '';
  const result = await paypal<{ verification_status: string }>(
    '/v1/notifications/verify-webhook-signature',
    {
      method: 'POST',
      body: {
        auth_algo: header('paypal-auth-algo'),
        cert_url: header('paypal-cert-url'),
        transmission_id: header('paypal-transmission-id'),
        transmission_sig: header('paypal-transmission-sig'),
        transmission_time: header('paypal-transmission-time'),
        webhook_id: process.env.PAYPAL_WEBHOOK_ID,
        webhook_event: event,
      },
    },
  );
  return result.verification_status === 'SUCCESS';
}
