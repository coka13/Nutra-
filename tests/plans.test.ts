import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeTier, clientCapacity, entitlements, COACH_CLIENT_LIMIT } from '../src/lib/plans';

const active = (tier: string) => ({ tier, status: 'ACTIVE' });
const paidCoach = { role: 'COACH', subscription: active('COACH') };
const unpaidCoach = { role: 'COACH', subscription: active('FREE') };

test('only an active subscription grants its tier', () => {
  assert.equal(activeTier(active('PREMIUM')), 'PREMIUM');
  assert.equal(activeTier({ tier: 'PREMIUM', status: 'PAST_DUE' }), 'FREE');
  assert.equal(activeTier({ tier: 'PRO', status: 'ACTIVE' }), 'FREE');
  assert.equal(activeTier(null), 'FREE');
});

test('coach capacity requires the paid coach plan once billing is live', () => {
  assert.equal(clientCapacity('COACH', active('COACH'), true), COACH_CLIENT_LIMIT);
  assert.equal(COACH_CLIENT_LIMIT, 10);
  assert.equal(clientCapacity('COACH', active('FREE'), true), 0);
  assert.equal(clientCapacity('COACH', active('PREMIUM'), true), 0);
  assert.equal(clientCapacity('COACH', { tier: 'COACH', status: 'CANCELLED' }, true), 0);
  assert.equal(clientCapacity('INDEPENDENT', active('COACH'), true), 0);
  // No billing provider (development): coaches keep the paid allowance.
  assert.equal(clientCapacity('COACH', active('FREE'), false), COACH_CLIENT_LIMIT);
});

test('free plan has ads and AI only through a paying coach', () => {
  const alone = entitlements({
    role: 'INDEPENDENT',
    sub: active('FREE'),
    billingOn: true,
    coaches: [],
  });
  assert.deepEqual(alone, { plan: 'FREE', ai: false, ads: true, clientLimit: 0 });
  const coached = entitlements({
    role: 'INDEPENDENT',
    sub: active('FREE'),
    billingOn: true,
    coaches: [paidCoach],
  });
  assert.equal(coached.ai, true);
  assert.equal(coached.ads, false);
  const unpaid = entitlements({
    role: 'INDEPENDENT',
    sub: active('FREE'),
    billingOn: true,
    coaches: [unpaidCoach],
  });
  assert.equal(unpaid.ai, false);
  assert.equal(unpaid.ads, false);
  assert.equal(
    entitlements({ role: 'INDEPENDENT', sub: null, billingOn: true, coaches: [] }).ads,
    true,
  );
});

test('plus removes ads but not AI', () => {
  const plus = entitlements({
    role: 'INDEPENDENT',
    sub: active('PREMIUM'),
    billingOn: true,
    coaches: [],
  });
  assert.deepEqual(plus, { plan: 'PREMIUM', ai: false, ads: false, clientLimit: 0 });
  const coachedPlus = entitlements({
    role: 'INDEPENDENT',
    sub: active('PREMIUM'),
    billingOn: true,
    coaches: [paidCoach],
  });
  assert.equal(coachedPlus.ai, true);
});

test('paying coaches get AI and no ads', () => {
  const coach = entitlements({ role: 'COACH', sub: active('COACH'), billingOn: true, coaches: [] });
  assert.deepEqual(coach, { plan: 'COACH', ai: true, ads: false, clientLimit: 10 });
  const lapsed = entitlements({ role: 'COACH', sub: active('FREE'), billingOn: true, coaches: [] });
  assert.equal(lapsed.ai, false);
  assert.equal(lapsed.ads, true);
});
