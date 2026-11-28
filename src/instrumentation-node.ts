import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Startup command failed: ${path.basename(args[0] ?? command)}`);
}

/**
 * Loads the bundled food database (used by food search) in the background whenever the
 * bundled file changes. A lock keeps concurrent workers from loading it twice.
 */
function loadFoodDatabase(appRoot: string, dataDir: string, tsx: string) {
  const source = path.join(appRoot, 'src', 'data', 'food-database.json');
  const loader = path.join(appRoot, 'scripts', 'load-food-database.ts');
  if (!existsSync(source) || !existsSync(loader)) {
    console.error(JSON.stringify({ event: 'food_database_skipped', reason: 'files_missing' }));
    return;
  }
  const hash = createHash('sha256').update(readFileSync(source)).digest('hex');
  const marker = path.join(dataDir, '.food-database.sha256');
  if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === hash) return;
  const lock = path.join(dataDir, '.food-database.lock');
  try {
    writeFileSync(lock, String(process.pid), { flag: 'wx' });
  } catch {
    return; // Another worker is loading it.
  }
  const child = spawn(process.execPath, [tsx, loader], { cwd: appRoot, env: process.env, stdio: 'inherit' });
  const done = (ok: boolean) => {
    if (ok) writeFileSync(marker, hash);
    else console.error(JSON.stringify({ event: 'food_database_failed' }));
    rmSync(lock, { force: true });
  };
  child.on('exit', (code) => done(code === 0));
  child.on('error', () => done(false));
}

/**
 * The app (fitura.fit) and the admin console (admin.fitura.fit) are separate deployments over the
 * same database and data directory, and each may have its own ADMIN_ENCRYPTION_KEY. Each one adds
 * its key to a shared keyring here, so either can decrypt what the other wrote (AI provider keys,
 * 2-step seeds, progress photos). New data is still sealed with the deployment's own key.
 */
function registerEncryptionKey(dataDir: string) {
  const own = process.env.ADMIN_ENCRYPTION_KEY?.trim();
  if (!own) return; // lib/admin/crypto reports the missing key where it is used.
  const keyring = path.join(dataDir, '.encryption-keyring');
  try {
    const known = existsSync(keyring) ? readFileSync(keyring, 'utf8').split(/\r?\n/).map((k) => k.trim()) : [];
    if (!known.includes(own)) appendFileSync(keyring, own + '\n', { mode: 0o600 });
  } catch (error) {
    console.error(JSON.stringify({ event: 'encryption_keyring_failed', error: error instanceof Error ? error.message : String(error) }));
  }
  process.env.ENCRYPTION_KEYRING_FILE ||= keyring;
}

/** Initializes the persistent SQLite database before Next.js serves production requests. */
export function setupDatabase() {
  if (process.env.NODE_ENV !== 'production' || process.env.NEXT_PHASE === 'phase-production-build') return;

  const dataDir = process.env.HOSTINGER_DATA_DIR || path.join(os.homedir(), 'fitura-data');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  registerEncryptionKey(dataDir);

  const configuredUrl = process.env.DATABASE_URL;
  if (!configuredUrl || (configuredUrl.startsWith('file:') && !path.isAbsolute(configuredUrl.slice(5))))
    process.env.DATABASE_URL = `file:${path.join(dataDir, 'nutri.db')}`;
  process.env.APP_URL ||= 'https://fitura.fit';
  // Each demo visitor gets a private, temporary account (see lib/demo).
  process.env.DEMO_ENABLED ||= 'true';

  const appRoot = process.cwd();
  const schema = path.join(appRoot, 'prisma', 'schema.prisma');
  const prisma = path.join(appRoot, 'node_modules', 'prisma', 'build', 'index.js');
  const tsx = path.join(appRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!existsSync(schema) || !existsSync(prisma) || !existsSync(tsx))
    throw new Error('Production database setup files are missing from the Node.js deployment.');

  run(process.execPath, [prisma, 'migrate', 'deploy', '--schema', schema], appRoot);
  run(process.execPath, [tsx, path.join(appRoot, 'prisma', 'seed.ts')], appRoot);
  loadFoodDatabase(appRoot, dataDir, tsx);
}
