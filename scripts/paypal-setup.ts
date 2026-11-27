/**
 * One-time PayPal setup: creates the Fitura+ product, the Plus and Coach monthly plans and
 * the webhook, then prints the PAYPAL_* values to put in the hosting environment.
 *
 *   PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... PAYPAL_ENV=live \
 *     npx tsx scripts/paypal-setup.ts https://fitura.fit
 *
 * Safe to re-run: an existing webhook for the same URL is reused. Plans are created anew on
 * each run (PayPal has no lookup key), so run it once per environment.
 */
import { PLAN_PRICE_USD } from '../src/lib/plans';

const id = process.env.PAYPAL_CLIENT_ID,
  secret = process.env.PAYPAL_CLIENT_SECRET,
  live = process.env.PAYPAL_ENV === 'live',
  appUrl = (process.argv[2] || process.env.APP_URL || '').replace(/\/$/, '');
if (!id || !secret || !appUrl.startsWith('https://')) {
  console.error('Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, and pass the https app URL.');
  process.exitCode = 1;
}
const base = live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!tokenRes.ok) throw new Error(`PayPal rejected the credentials (${tokenRes.status}).`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as T;
}

async function main() {
  const product = await call<{ id: string }>('/v1/catalogs/products', 'POST', {
    name: 'Fitura+',
    description: 'Fitura+ membership',
    type: 'SERVICE',
    category: 'SOFTWARE',
    home_url: appUrl,
  });

  async function plan(name: string, price: number) {
    const created = await call<{ id: string }>('/v1/billing/plans', 'POST', {
      product_id: product.id,
      name,
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: { fixed_price: { value: price.toFixed(2), currency_code: 'USD' } },
        },
      ],
      payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 },
    });
    return created.id;
  }
  const premium = await plan('Fitura+ Plus', PLAN_PRICE_USD.PREMIUM);
  const coach = await plan('Fitura+ Coach', PLAN_PRICE_USD.COACH);

  const webhookUrl = `${appUrl}/api/webhooks/paypal`;
  const { webhooks } = await call<{ webhooks: { id: string; url: string }[] }>(
    '/v1/notifications/webhooks',
  );
  const webhookId =
    webhooks.find((w) => w.url === webhookUrl)?.id ??
    (
      await call<{ id: string }>('/v1/notifications/webhooks', 'POST', {
        url: webhookUrl,
        event_types: [
          'BILLING.SUBSCRIPTION.ACTIVATED',
          'BILLING.SUBSCRIPTION.UPDATED',
          'BILLING.SUBSCRIPTION.CANCELLED',
          'BILLING.SUBSCRIPTION.SUSPENDED',
          'BILLING.SUBSCRIPTION.EXPIRED',
          'PAYMENT.SALE.COMPLETED',
        ].map((name) => ({ name })),
      })
    ).id;

  console.log('\nAdd these to the hosting environment (with your client ID and secret):\n');
  console.log(`PAYPAL_ENV=${live ? 'live' : 'sandbox'}`);
  console.log(`PAYPAL_PLAN_PREMIUM=${premium}`);
  console.log(`PAYPAL_PLAN_COACH=${coach}`);
  console.log(`PAYPAL_WEBHOOK_ID=${webhookId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
