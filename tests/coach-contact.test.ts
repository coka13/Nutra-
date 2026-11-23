import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navigationPolicy } from '../mobile/src/origin';
import { isInternationalPhone, normalizePhone } from '../src/lib/phone';

test('coach numbers normalize formatting and international dialing prefixes', () => {
  assert.equal(normalizePhone('+972 (50) 123-4567'), '+972501234567');
  assert.equal(normalizePhone('0044 7700 900123'), '+447700900123');
  for (const phone of ['+972 (50) 123-4567', '0044 7700 900123'])
    assert.ok(isInternationalPhone(phone));
  for (const phone of [
    '',
    '0501234567',
    '+0123456789',
    '+972123<script>',
    '+123',
    '+1234567890123456',
  ])
    assert.ok(!isInternationalPhone(phone));
});

test('native coach contacts open externally while unsafe links stay blocked', () => {
  const origin = 'https://nutri.example';
  for (const link of [
    'tel:+972501234567',
    'mailto:coach@example.test',
    'https://wa.me/972501234567',
  ])
    assert.equal(navigationPolicy(link, origin), 'external');
  assert.equal(navigationPolicy(origin + '/app/messages', origin), 'internal');
  for (const link of [
    'javascript:alert(1)',
    'file:///secret',
    'data:text/html,hello',
    'http://other.example',
  ])
    assert.equal(navigationPolicy(link, origin), 'block');
});
