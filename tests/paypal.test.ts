import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paypalConfigured, paypalStatus, tierForPaypalPlan } from '../src/lib/paypal';

test('maps PayPal subscription states to local status', () => {
  assert.equal(paypalStatus('ACTIVE'), 'ACTIVE');
  assert.equal(paypalStatus('SUSPENDED'), 'PAST_DUE');
  assert.equal(paypalStatus('CANCELLED'), 'CANCELLED');
  assert.equal(paypalStatus('EXPIRED'), 'CANCELLED');
  assert.equal(paypalStatus('APPROVAL_PENDING'), 'INACTIVE');
});

test('maps PayPal plans to tiers and requires full configuration', () => {
  const saved = { ...process.env };
  Object.assign(process.env, {
    PAYPAL_CLIENT_ID: 'id',
    PAYPAL_CLIENT_SECRET: 'secret',
    PAYPAL_WEBHOOK_ID: 'wh',
    PAYPAL_PLAN_PREMIUM: 'P-PLUS',
    PAYPAL_PLAN_COACH: 'P-COACH',
    APP_URL: 'https://example.test',
  });
  try {
    assert.equal(tierForPaypalPlan('P-PLUS'), 'PREMIUM');
    assert.equal(tierForPaypalPlan('P-COACH'), 'COACH');
    assert.equal(tierForPaypalPlan('P-OTHER'), null);
    assert.equal(tierForPaypalPlan(''), null);
    assert.equal(paypalConfigured(), true);
    process.env.PAYPAL_PLAN_COACH = 'P-PLUS';
    assert.equal(paypalConfigured(), false, 'identical plan IDs are rejected');
    delete process.env.PAYPAL_WEBHOOK_ID;
    assert.equal(paypalConfigured(), false);
  } finally {
    process.env = saved;
  }
});

test('discount prices round to cents', async () => {
  const { discountedPrice } = await import('../src/lib/paypal');
  assert.equal(discountedPrice('5.00', 20), '4.00');
  assert.equal(discountedPrice('30.00', 15), '25.50');
  assert.equal(discountedPrice('5', 33), '3.35');
});
