import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Startup command failed: ${path.basename(args[0] ?? command)}`);
}

/** Initializes the persistent SQLite database before Next.js serves production requests. */
export function register() {
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_RUNTIME !== 'nodejs' ||
    process.env.NEXT_PHASE === 'phase-production-build'
  ) return;

  const dataDir = process.env.HOSTINGER_DATA_DIR || path.join(os.homedir(), 'fitura-data');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });

  const configuredUrl = process.env.DATABASE_URL;
  if (!configuredUrl || (configuredUrl.startsWith('file:') && !path.isAbsolute(configuredUrl.slice(5))))
    process.env.DATABASE_URL = `file:${path.join(dataDir, 'nutri.db')}`;
  process.env.APP_URL ||= 'https://fitura.fit';
  process.env.DEMO_ENABLED = 'false';

  const appRoot = process.cwd();
  const schema = path.join(appRoot, 'prisma', 'schema.prisma');
  const prisma = path.join(appRoot, 'node_modules', 'prisma', 'build', 'index.js');
  const tsx = path.join(appRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!existsSync(schema) || !existsSync(prisma) || !existsSync(tsx))
    throw new Error('Production database setup files are missing from the Node.js deployment.');

  run(process.execPath, [prisma, 'migrate', 'deploy', '--schema', schema], appRoot);
  run(process.execPath, [tsx, path.join(appRoot, 'prisma', 'seed.ts')], appRoot);
}
