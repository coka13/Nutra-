import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  tokenHash,
  overlaps,
  canReadClient,
} from '../src/lib/security';
import { messages, translate } from '../src/lib/i18n';
test('password hashing uses distinct salts and rejects invalid credentials', () => {
  const a = hashPassword('long-enough-password'),
    b = hashPassword('long-enough-password');
  assert.notEqual(a, b);
  assert(verifyPassword('long-enough-password', a));
  assert(!verifyPassword('wrong', a));
  assert(!verifyPassword('anything', 'malformed'));
});
test('session token digests are deterministic and do not reveal the token', () => {
  assert.equal(tokenHash('secret'), tokenHash('secret'));
  assert.equal(tokenHash('secret').length, 64);
  assert.notEqual(tokenHash('secret'), 'secret');
});
test('appointment intervals allow adjacent slots and reject partial or contained overlaps', () => {
  const d = (n: number) => new Date(n * 1000);
  assert(overlaps(d(1), d(5), d(4), d(7)));
  assert(overlaps(d(1), d(8), d(2), d(3)));
  assert(!overlaps(d(1), d(5), d(5), d(8)));
});
test('roles and explicit consent control cross-user health access', () => {
  assert(canReadClient('INDEPENDENT', 'a', 'a', false));
  assert(!canReadClient('INDEPENDENT', 'a', 'b', true));
  assert(!canReadClient('COACH', 'a', 'b', false));
  assert(canReadClient('COACH', 'a', 'b', true));
  assert(!canReadClient('ADMIN', 'a', 'b', false));
});
test('every UI dictionary entry has English and Hebrew content', () => {
  for (const [key, pair] of Object.entries(messages)) {
    assert(pair[0].trim(), `${key} missing English`);
    assert(pair[1].trim(), `${key} missing Hebrew`);
  }
  assert.equal(translate('he', 'dashboard'), 'סקירה כללית');
  assert.equal(translate('en', 'dashboard'), 'Overview');
});
