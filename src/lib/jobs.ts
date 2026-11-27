import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from './db';
import { deliverDueAnnouncements } from './announcements';
import { flushMetrics } from './metrics';

export const JOBS = ['announcements', 'cleanup', 'metrics', 'backup'] as const;
export type JobName = (typeof JOBS)[number];

/** Absolute path of the SQLite database file, or null for non-file databases. */
export function databaseFile() {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('file:')) return null;
  const file = url.slice(5).split('?')[0];
  // Prisma resolves relative SQLite paths against the schema directory.
  return path.isAbsolute(file) ? file : path.resolve('prisma', file);
}
export function backupDirectory() {
  if (process.env.BACKUP_DIR) return path.resolve(process.env.BACKUP_DIR);
  const file = databaseFile();
  return file ? path.join(path.dirname(file), 'backups') : null;
}
const KEEP_BACKUPS = Number(process.env.BACKUP_KEEP || 14);

async function backup() {
  const directory = backupDirectory();
  if (!directory) throw new Error('backups require a SQLite file database');
  await fs.mkdir(directory, { recursive: true });
  const target = path.join(directory, `nutra-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  // VACUUM INTO writes a consistent snapshot without blocking readers for long.
  await db.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const files = (await fs.readdir(directory)).filter((f) => /^nutra-.*\.db$/.test(f)).sort();
  for (const old of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS)))
    await fs.unlink(path.join(directory, old)).catch(() => {});
  const { size } = await fs.stat(target);
  return `${path.basename(target)} (${Math.round(size / 1024)} KB)`;
}

async function cleanup() {
  const now = new Date(),
    monthAgo = new Date(Date.now() - 30 * 86400000);
  const results = await db.$transaction([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.adminSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.adminChallenge.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.passwordReset.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.emailVerification.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.rateLimit.deleteMany({ where: { resetsAt: { lt: now } } }),
    db.requestError.deleteMany({ where: { createdAt: { lt: monthAgo } } }),
    db.apiMetric.deleteMany({ where: { hour: { lt: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 13) } } }),
  ]);
  return `removed ${results.reduce((sum, r) => sum + r.count, 0)} expired rows`;
}

const runners: Record<JobName, () => Promise<string>> = {
  announcements: async () => `delivered ${await deliverDueAnnouncements()}`,
  cleanup,
  metrics: async () => {
    await flushMetrics();
    return 'flushed';
  },
  backup,
};

/** Runs a job and records its outcome; overlapping runs of the same job are skipped. */
export async function runJob(job: JobName) {
  const running = await db.jobRun.findFirst({
    where: { job, status: 'RUNNING', startedAt: { gt: new Date(Date.now() - 15 * 60000) } },
  });
  if (running) return { job, status: 'SKIPPED', detail: 'already running' };
  const row = await db.jobRun.create({ data: { job, status: 'RUNNING' } });
  try {
    const detail = await runners[job]();
    await db.jobRun.update({ where: { id: row.id }, data: { status: 'SUCCESS', detail, finishedAt: new Date() } });
    return { job, status: 'SUCCESS', detail };
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 200) : 'failed';
    await db.jobRun.update({ where: { id: row.id }, data: { status: 'FAILED', detail, finishedAt: new Date() } });
    return { job, status: 'FAILED', detail };
  }
}
