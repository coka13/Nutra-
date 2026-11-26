import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness/readiness probe for Docker, the reverse proxy and deploy rollbacks. */
export async function GET() {
  const started = performance.now();
  const database = await db
    .$queryRawUnsafe('SELECT 1')
    .then(() => true)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const reason = /Environment variable not found: DATABASE_URL/i.test(message)
        ? 'database_url_missing'
        : /unable to open database file/i.test(message)
          ? 'sqlite_file_unavailable'
          : /query engine.*(not found|could not be located)|could not locate the query engine/i.test(
                message,
              )
            ? 'prisma_engine_unavailable'
            : error instanceof Error
              ? error.name
              : 'unknown';
      console.error(JSON.stringify({ event: 'database_health_failure', reason }));
      return false;
    });
  return NextResponse.json(
    { status: database ? 'ok' : 'down', database, latencyMs: Math.round(performance.now() - started) },
    { status: database ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
