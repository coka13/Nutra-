import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness/readiness probe for Docker, the reverse proxy and deploy rollbacks. */
export async function GET() {
  const started = performance.now();
  const database = await db.$queryRawUnsafe('SELECT 1').then(() => true).catch(() => false);
  return NextResponse.json(
    { status: database ? 'ok' : 'down', database, latencyMs: Math.round(performance.now() - started) },
    { status: database ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
