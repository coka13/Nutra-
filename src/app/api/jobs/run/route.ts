import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { JOBS, runJob, type JobName } from '@/lib/jobs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled jobs, triggered by the host's cron/systemd timer:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://app/api/jobs/run?job=announcements
 * Disabled unless CRON_SECRET (32+ characters) is set.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  const given = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const valid =
    secret.length >= 32 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!valid) return NextResponse.json({ error: 'notFound' }, { status: 404 });
  const requested = req.nextUrl.searchParams.get('job');
  const jobs = requested ? (JOBS.includes(requested as JobName) ? [requested as JobName] : []) : (['announcements', 'metrics', 'cleanup'] as JobName[]);
  if (!jobs.length) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const results = [];
  for (const job of jobs) results.push(await runJob(job));
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
}
