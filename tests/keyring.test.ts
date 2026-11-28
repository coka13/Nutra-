import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, openBytes, sealBytes } from '../src/lib/admin/crypto';

// Production runs the app and the admin console as separate deployments with different keys,
// over one database. Each must read what the other wrote once both keys are in the keyring.
test('a deployment decrypts secrets and photos sealed with another deployment key from the keyring', () => {
  const adminKey = randomBytes(32).toString('hex'),
    appKey = randomBytes(32).toString('hex');
  const dir = mkdtempSync(path.join(tmpdir(), 'keyring-'));
  const ring = path.join(dir, '.encryption-keyring');
  const saved = { key: process.env.ADMIN_ENCRYPTION_KEY, file: process.env.ENCRYPTION_KEYRING_FILE };
  try {
    process.env.ENCRYPTION_KEYRING_FILE = ring;
    process.env.ADMIN_ENCRYPTION_KEY = adminKey;
    const secret = encryptSecret('sk-or-v1-test');
    const photo = sealBytes(new Uint8Array([1, 2, 3, 4]));

    process.env.ADMIN_ENCRYPTION_KEY = appKey;
    writeFileSync(ring, `${appKey}\n`);
    assert.throws(() => decryptSecret(secret), 'without the other key it cannot be read');

    writeFileSync(ring, `${appKey}\n${adminKey}\n`);
    assert.equal(decryptSecret(secret), 'sk-or-v1-test');
    assert.deepEqual([...openBytes(photo)], [1, 2, 3, 4]);
    // New data is still sealed with the deployment's own key.
    process.env.ENCRYPTION_KEYRING_FILE = '';
    assert.equal(decryptSecret(encryptSecret('own')), 'own');
  } finally {
    process.env.ADMIN_ENCRYPTION_KEY = saved.key;
    process.env.ENCRYPTION_KEYRING_FILE = saved.file;
    if (saved.key === undefined) delete process.env.ADMIN_ENCRYPTION_KEY;
    if (saved.file === undefined) delete process.env.ENCRYPTION_KEYRING_FILE;
  }
});
