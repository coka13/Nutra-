import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { isSealedBytes, openBytes, sealBytes } from '../src/lib/admin/crypto';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(500)]);

test('progress photos round-trip through at-rest encryption', () => {
  const sealed = sealBytes(jpeg);
  assert.ok(isSealedBytes(sealed));
  assert.ok(
    !Buffer.from(sealed).includes(jpeg.subarray(4, 40)),
    'ciphertext must not contain the image',
  );
  assert.deepEqual(openBytes(sealed), jpeg);
});

test('photos stored before encryption are returned unchanged', () => {
  assert.ok(!isSealedBytes(jpeg));
  assert.deepEqual(openBytes(jpeg), jpeg);
});

test('tampered ciphertext is rejected', () => {
  const sealed = Buffer.from(sealBytes(jpeg));
  sealed[sealed.length - 1] ^= 1;
  assert.throws(() => openBytes(sealed));
});
