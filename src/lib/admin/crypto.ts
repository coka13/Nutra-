import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Server-only secrets at rest (TOTP seeds, AI provider keys) use AES-256-GCM with
 * ADMIN_ENCRYPTION_KEY (32 bytes, base64 or hex). Production refuses to run without it.
 */
function parseKey(raw: string) {
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return key.length === 32 ? key : null;
}
function encryptionKey() {
  const raw = process.env.ADMIN_ENCRYPTION_KEY?.trim();
  if (raw) {
    const key = parseKey(raw);
    if (!key) throw new Error('ADMIN_ENCRYPTION_KEY must decode to 32 bytes');
    return key;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('ADMIN_ENCRYPTION_KEY is required');
  // Development only: stable per database so local data stays readable between restarts.
  return createHash('sha256')
    .update('nutra-development-only:' + (process.env.DATABASE_URL || ''))
    .digest();
}

/**
 * Keys other deployments sharing this database encrypt with. Production runs the app and the
 * admin console as separate deployments, each with its own ADMIN_ENCRYPTION_KEY; each registers
 * its key in a shared keyring file at startup (scripts/hostinger-start.mjs), so either one can
 * read what the other wrote. New data is always sealed with this deployment's own key.
 * ADMIN_ENCRYPTION_KEYS_PREVIOUS (comma-separated) adds keys by hand, e.g. after a rotation.
 */
let ring: { at: number; keys: Buffer[] } | null = null;
function otherKeys(fresh = false) {
  if (!fresh && ring && Date.now() - ring.at < 60_000) return ring.keys;
  const raw = (process.env.ADMIN_ENCRYPTION_KEYS_PREVIOUS || '').split(',');
  const file = process.env.ENCRYPTION_KEYRING_FILE;
  if (file)
    try {
      raw.push(...readFileSync(file, 'utf8').split(/\r?\n/));
    } catch {}
  const own = encryptionKey();
  const keys: Buffer[] = [];
  for (const line of raw) {
    const key = line.trim() && parseKey(line.trim());
    if (key && !key.equals(own) && !keys.some((k) => k.equals(key))) keys.push(key);
  }
  ring = { at: Date.now(), keys };
  return keys;
}
/** Opens with this deployment's key, then with the other known keys (re-reading them once). */
function withAnyKey<T>(open: (key: Buffer) => T): T {
  try {
    return open(encryptionKey());
  } catch (error) {
    for (const fresh of [false, true])
      for (const key of otherKeys(fresh))
        try {
          return open(key);
        } catch {}
    throw error;
  }
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}

export function decryptSecret(sealed: string) {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('invalid secret');
  return withAnyKey((key) => {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
  });
}

/**
 * Binary data at rest (progress photos): MAGIC + 12-byte IV + 16-byte GCM tag + ciphertext.
 * Rows written before encryption existed are plain JPEG and are returned unchanged.
 */
const SEALED_MAGIC = Buffer.from('FPE1');
export const isSealedBytes = (data: Uint8Array) =>
  data.length > 32 && Buffer.from(data.subarray(0, 4)).equals(SEALED_MAGIC);

export function sealBytes(plain: Uint8Array): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return new Uint8Array(Buffer.concat([SEALED_MAGIC, iv, cipher.getAuthTag(), body]));
}

export function openBytes(stored: Uint8Array): Buffer {
  if (!isSealedBytes(stored)) return Buffer.from(stored);
  const data = Buffer.from(stored);
  return withAnyKey((key) => {
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(4, 16));
    decipher.setAuthTag(data.subarray(16, 32));
    return Buffer.concat([decipher.update(data.subarray(32)), decipher.final()]);
  });
}

/** Shows only enough of a saved key to recognise it. */
export function secretHint(secret: string) {
  const trimmed = secret.trim();
  return trimmed.length <= 8 ? '••••' : `${trimmed.slice(0, 3)}…${trimmed.slice(-4)}`;
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buffer: Buffer) {
  let bits = 0,
    value = 0,
    out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(input: string) {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0,
    value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateTotpSecret = () => base32Encode(randomBytes(20));

/** RFC 6238 TOTP (HMAC-SHA1, 30 s, 6 digits) for a given time step. */
export function totpAt(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return code.toString().padStart(6, '0');
}
export const totpStep = (now = Date.now()) => Math.floor(now / 30000);

/**
 * Accepts the current step ±1 for clock drift. Returns the matched step so callers can
 * reject replays (a step at or before the last accepted one), or null.
 */
export function verifyTotp(secret: string, code: string, lastStep?: number | null, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = totpStep(now);
  for (const step of [current - 1, current, current + 1]) {
    if (lastStep != null && step <= lastStep) continue;
    const expected = Buffer.from(totpAt(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer = 'Fitura+ Admin') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
/** Ten single-use recovery codes; only digests are stored. */
export function generateRecoveryCodes() {
  const codes = Array.from({ length: 10 }, () => {
    const raw = base32Encode(randomBytes(6)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { codes, stored: codes.map((code) => digest(code.replace('-', ''))).join(',') };
}
/** Returns the remaining stored digests when the code matches, otherwise null. */
export function consumeRecoveryCode(stored: string, code: string) {
  const wanted = digest(code.toUpperCase().replace(/[\s-]/g, ''));
  const list = stored.split(',').filter(Boolean);
  const index = list.findIndex((entry) =>
    entry.length === wanted.length && timingSafeEqual(Buffer.from(entry), Buffer.from(wanted)),
  );
  if (index < 0) return null;
  list.splice(index, 1);
  return list.join(',');
}
