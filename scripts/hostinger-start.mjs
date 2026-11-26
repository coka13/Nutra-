import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = process.env.HOSTINGER_DATA_DIR || path.join(os.homedir(), 'fitura-data');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });

function persistentSecret(filename, byteLength) {
  const secretPath = path.join(dataDir, filename);
  if (existsSync(secretPath)) return readFileSync(secretPath, 'utf8').trim();
  const secret = randomBytes(byteLength).toString('hex');
  try {
    writeFileSync(secretPath, secret, { flag: 'wx', mode: 0o600 });
    return secret;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return readFileSync(secretPath, 'utf8').trim();
  }
}

process.env.DATABASE_URL ||= `file:${path.join(dataDir, 'nutri.db')}`;
process.env.APP_URL ||= 'https://charming-pink-ostrich-04.hostingersite.com';
process.env.DEMO_ENABLED = 'false';
process.env.ENFORCE_HTTPS = 'true';
process.env.BACKUP_DIR ||= path.join(dataDir, 'backups');
process.env.ADMIN_ENCRYPTION_KEY ||= persistentSecret('.admin-encryption-key', 32);
process.env.CRON_SECRET ||= persistentSecret('.cron-secret', 24);

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const script of ['db:migrate', 'db:seed']) {
  const result = spawnSync(npm, ['run', script], { env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '0.0.0.0'],
  { env: process.env, stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});