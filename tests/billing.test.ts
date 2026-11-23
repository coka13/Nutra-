import { test } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { subscriptionStatus, verifyStripeWebhook, billingConfigured } from '../src/lib/billing';
test('billing stays disabled without complete environment configuration', () => {
  if (!process.env.STRIPE_SECRET_KEY) assert.equal(billingConfigured(), false);
});
test('provider states map to revocable entitlements', () => {
  assert.equal(subscriptionStatus('active'), 'ACTIVE');
  assert.equal(subscriptionStatus('trialing'), 'ACTIVE');
  assert.equal(subscriptionStatus('past_due'), 'PAST_DUE');
  assert.equal(subscriptionStatus('canceled'), 'CANCELLED');
  assert.equal(subscriptionStatus('incomplete'), 'INACTIVE');
});
test('webhooks require authentic unmodified raw payload and reject stale timestamps', () => {
  const stripe = new Stripe('sk_test_unit_only'),
    secret = 'whsec_unit_only',
    payload = JSON.stringify({
      id: 'evt_fixture',
      type: 'test.fixture',
      object: 'event',
      data: { object: {} },
    });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(verifyStripeWebhook(payload, signature, secret).id, 'evt_fixture');
  assert.throws(() => verifyStripeWebhook(payload + ' ', signature, secret));
  assert.throws(() => verifyStripeWebhook(payload, signature, 'wrong'));
  const stale = stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: 1 });
  assert.throws(() => verifyStripeWebhook(payload, stale, secret));
});
