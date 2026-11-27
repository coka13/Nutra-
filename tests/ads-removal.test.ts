import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entitlements } from '../src/lib/plans';
import { adsTxt, adsenseUnit } from '../src/lib/adsense';

const member = (sub: { tier: string; status: string } | null, role = 'USER') =>
  entitlements({ role, sub, billingOn: true, coaches: [] });

test('paying members never see ads', () => {
  assert.equal(member(null).ads, true);
  assert.equal(member({ tier: 'PREMIUM', status: 'ACTIVE' }).ads, false);
  assert.equal(member({ tier: 'COACH', status: 'ACTIVE' }, 'COACH').ads, false);
});

test('ads return when a paid plan is no longer active', () => {
  for (const status of ['PAST_DUE', 'CANCELLED', 'INACTIVE'])
    assert.equal(member({ tier: 'PREMIUM', status }).ads, true);
});

test('AdSense stays off until valid IDs are set, and ads.txt follows the publisher', () => {
  const saved = { ...process.env };
  delete process.env.ADSENSE_CLIENT;
  delete process.env.ADSENSE_SLOT;
  assert.equal(adsenseUnit(), null);
  assert.equal(adsTxt(), '');
  Object.assign(process.env, { ADSENSE_CLIENT: 'ca-pub-1234567890123456', ADSENSE_SLOT: '1234567890' });
  assert.deepEqual(adsenseUnit(), { client: 'ca-pub-1234567890123456', slot: '1234567890' });
  assert.equal(adsTxt(), 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
  process.env.ADSENSE_CLIENT = 'not-an-id';
  assert.equal(adsenseUnit(), null);
  process.env = saved;
});
