import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base32Decode,
  base32Encode,
  consumeRecoveryCode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  secretHint,
  totpAt,
  verifyTotp,
} from '../src/lib/admin/crypto';
import { ADMIN_ROLES, PERMISSIONS, can, permissionsFor } from '../src/lib/admin/rbac';
import { sanitizeDetails } from '../src/lib/admin/audit';
import { toCsv, maskEmail } from '../src/lib/admin/api/types';
import {
  configSchema,
  defaultConfig,
  parseStoredConfig,
  publicConfig,
  versionBelow,
} from '../src/lib/remote-config';
import { DEFAULT_RULES, clientCapacity, entitlements, isMinor } from '../src/lib/plans';
import { routeGroup } from '../src/lib/metrics';
import { adminMessages } from '../src/components/admin/i18n';

const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

test('TOTP matches the RFC 6238 SHA-1 test vectors', () => {
  assert.equal(RFC_SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  // RFC vectors are 8 digits; the 6-digit code is the last six.
  assert.equal(totpAt(RFC_SECRET, Math.floor(59 / 30)), '287082');
  assert.equal(totpAt(RFC_SECRET, Math.floor(1111111109 / 30)), '081804');
  assert.equal(totpAt(RFC_SECRET, Math.floor(1234567890 / 30)), '005924');
  assert.equal(totpAt(RFC_SECRET, Math.floor(2000000000 / 30)), '279037');
  assert.deepEqual(base32Decode(RFC_SECRET), Buffer.from('12345678901234567890'));
});

test('TOTP accepts ±1 step for drift and rejects replays and malformed codes', () => {
  const now = 1_800_000_000_000;
  const step = Math.floor(now / 30000);
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step), null, now), step);
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), null, now), step - 1);
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 2), null, now), null);
  // Replay: a step at or before the last accepted one is refused.
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step), step, now), null);
  assert.equal(verifyTotp(RFC_SECRET, '12345', null, now), null);
  assert.equal(verifyTotp(RFC_SECRET, 'abcdef', null, now), null);
});

test('secrets at rest are authenticated-encrypted and never stored in clear', () => {
  const sealed = encryptSecret('sk-live-abcdef123456');
  assert.ok(!sealed.includes('abcdef123456'));
  assert.equal(decryptSecret(sealed), 'sk-live-abcdef123456');
  assert.notEqual(encryptSecret('same'), encryptSecret('same'));
  const [v, iv, tag, body] = sealed.split('.');
  const tampered = [
    v,
    iv,
    tag,
    Buffer.from('x' + Buffer.from(body, 'base64').toString('binary')).toString('base64'),
  ].join('.');
  assert.throws(() => decryptSecret(tampered));
  assert.equal(secretHint('sk-live-abcdef123456'), 'sk-…3456');
  assert.equal(secretHint('short'), '••••');
});

test('recovery codes are single-use and stored only as digests', () => {
  const { codes, stored } = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  for (const code of codes) assert.ok(!stored.includes(code.replace('-', '')));
  const remaining = consumeRecoveryCode(stored, codes[3].toLowerCase());
  assert.ok(remaining !== null);
  assert.equal(remaining!.split(',').length, 9);
  assert.equal(consumeRecoveryCode(remaining!, codes[3]), null);
  assert.equal(consumeRecoveryCode(stored, 'AAAAA-BBBBB'), null);
});

test('RBAC follows least privilege and only Super Admins manage administrators', () => {
  assert.deepEqual(permissionsFor('SUPER_ADMIN').sort(), [...PERMISSIONS].sort());
  for (const role of ADMIN_ROLES.filter((r) => r !== 'SUPER_ADMIN')) {
    assert.equal(can(role, 'admins.manage'), false, role);
    assert.equal(can(role, 'users.delete'), false, role);
    assert.ok(permissionsFor(role).length < PERMISSIONS.length, role);
  }
  assert.equal(can('CONTENT_MANAGER', 'users.view'), false);
  assert.equal(can('CONTENT_MANAGER', 'content.manage'), true);
  assert.equal(can('SUPPORT_ADMIN', 'billing.manage'), false);
  assert.equal(can('SUPPORT_ADMIN', 'support.manage'), true);
  assert.equal(can('FINANCE_ADMIN', 'config.manage'), false);
  assert.equal(can('FINANCE_ADMIN', 'billing.manage'), true);
  assert.equal(can('TECHNICAL_ADMIN', 'users.view'), false);
  assert.equal(can('TECHNICAL_ADMIN', 'system.manage'), true);
  // App roles and unknown strings grant nothing.
  for (const role of ['ADMIN', 'COACH', 'INDEPENDENT', '', 'super_admin'])
    assert.deepEqual(permissionsFor(role), [], role);
});

test('remote config has safe defaults, survives bad input and hides internals', () => {
  const config = defaultConfig();
  assert.equal(config.maintenance.enabled, false);
  assert.equal(config.features.userRegistration, true);
  assert.equal(config.plans.coachClientLimit, 10);
  assert.equal(config.ads.excludeMinors, true);
  assert.deepEqual(parseStoredConfig('not json'), config);
  // One invalid section falls back alone; valid sections are kept.
  const mixed = parseStoredConfig(
    JSON.stringify({ maintenance: { enabled: true }, ai: { monthlyBudgetUsd: -5 } }),
  );
  assert.equal(mixed.maintenance.enabled, true);
  assert.equal(mixed.ai.monthlyBudgetUsd, 0);
  assert.throws(() => configSchema.parse({ ads: { excludeMinors: false } }));
  assert.throws(() => configSchema.parse({ app: { minimumVersion: '1.2.x' } }));
  const pub = JSON.stringify(
    publicConfig(
      {
        ...config,
        plans: { ...config.plans, stripePriceIds: { PREMIUM: 'price_secret1', COACH: '' } },
      },
      3,
    ),
  );
  assert.ok(!pub.includes('price_secret1'));
  assert.ok(!pub.includes('monthlyBudgetUsd'));
  assert.equal(versionBelow('1.2.0', '1.10.0'), true);
  assert.equal(versionBelow('2.0', '1.9.9'), false);
  assert.equal(versionBelow('1.0.0', '1.0'), false);
});

const active = (tier: string) => ({ tier, status: 'ACTIVE' });

test('complimentary grants, minors and coach approval change entitlements as configured', () => {
  const base = { role: 'INDEPENDENT', sub: active('FREE'), billingOn: true, coaches: [] };
  assert.deepEqual(entitlements(base), { plan: 'FREE', ai: false, ads: true, clientLimit: 0 });
  assert.equal(entitlements({ ...base, grants: ['AD_FREE'] }).ads, false);
  assert.equal(entitlements({ ...base, grants: ['PREMIUM'] }).plan, 'PREMIUM');
  assert.equal(entitlements({ ...base, grants: ['AI'] }).ai, true);
  assert.equal(entitlements({ ...base, minor: true }).ads, false);
  assert.equal(
    entitlements({ ...base, rules: { ...DEFAULT_RULES, adsEnabled: false } }).ads,
    false,
  );
  assert.equal(
    entitlements({ ...base, grants: ['AI'], rules: { ...DEFAULT_RULES, aiEnabled: false } }).ai,
    false,
  );
  const coach = { role: 'COACH', sub: active('COACH'), billingOn: true, coaches: [] };
  assert.equal(entitlements(coach).clientLimit, 10);
  assert.equal(entitlements({ ...coach, coach: { coachStatus: 'PENDING' } }).clientLimit, 0);
  assert.equal(entitlements({ ...coach, coach: { coachStatus: 'REVOKED' } }).ai, false);
  assert.equal(entitlements({ ...coach, coach: { coachClientLimit: 25 } }).clientLimit, 25);
  assert.equal(
    entitlements({ ...coach, rules: { ...DEFAULT_RULES, coachClientLimit: 4 } }).clientLimit,
    4,
  );
  assert.equal(clientCapacity('COACH', active('FREE'), true, { grants: ['COACH'] }), 10);
  // A coach whose approval was revoked no longer extends AI to clients.
  const client = {
    ...base,
    coaches: [{ role: 'COACH', subscription: active('COACH'), coachStatus: 'REVOKED' }],
  };
  assert.equal(entitlements(client).ai, false);
  assert.equal(isMinor(new Date().getFullYear() - 15), true);
  assert.equal(isMinor(1990), false);
  assert.equal(isMinor(null), false);
});

test('audit details redact secrets and bound their size', () => {
  const clean = sanitizeDetails({
    email: 'a@b.c',
    password: 'hunter2',
    apiKey: 'sk-1',
    nested: { totpCode: '123456', ok: 'x'.repeat(500) },
  }) as Record<string, unknown>;
  assert.equal(clean.password, '[redacted]');
  assert.equal(clean.apiKey, '[redacted]');
  assert.equal((clean.nested as Record<string, unknown>).totpCode, '[redacted]');
  assert.ok(String((clean.nested as Record<string, unknown>).ok).length <= 201);
  assert.equal(clean.email, 'a@b.c');
});

test('CSV exports neutralise spreadsheet formulas and quote correctly', () => {
  const csv = toCsv(
    [{ a: '=HYPERLINK("x")', b: 'plain, text', c: '+1', d: 'say "hi"' }],
    ['a', 'b', 'c', 'd'],
  );
  assert.equal(csv.split('\r\n')[1], `"'=HYPERLINK(""x"")","plain, text",'+1,"say ""hi"""`);
  assert.equal(maskEmail('dana@example.com'), 'd***@example.com');
});

test('metric route groups keep cardinality low and never include ids', () => {
  assert.equal(routeGroup('meals/add'), 'meals/add');
  assert.equal(routeGroup('users/ckabcdefghijklmnopqrstu'), 'users');
  assert.equal(routeGroup('state'), 'state');
  assert.equal(routeGroup('progress/photos/delete'), 'progress/photos');
});

test('every admin console string has English and Hebrew text', () => {
  for (const [key, [en, he]] of Object.entries(adminMessages)) {
    assert.ok(en.trim(), key);
    assert.ok(he.trim(), key);
  }
});
