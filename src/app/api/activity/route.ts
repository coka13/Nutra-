import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, rateLimit, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { acceptsOrigin } from '@/lib/request-origin';
import { activityDate, healthSyncInput } from '@/lib/activity';

const headers = { 'Cache-Control': 'private, no-store' };
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof ApiError
          ? error.code
          : error instanceof z.ZodError || error instanceof SyntaxError
            ? 'invalid'
            : 'serverError',
    },
    {
      status:
        error instanceof ApiError
          ? error.status
          : error instanceof z.ZodError || error instanceof SyntaxError
            ? 400
            : 500,
      headers,
    },
  );
}
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const date = activityDate.parse(req.nextUrl.searchParams.get('date'));
    const [steps, activities] = await Promise.all([
      db.dailySteps.findUnique({ where: { userId_date: { userId: user.id, date } } }),
      db.cardioActivity.findMany({
        // Only data synced from the fitness app is shown; manual logging was removed.
        where: { userId: user.id, date, source: { not: 'manual' } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return NextResponse.json({ steps, activities }, { headers });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    if (!acceptsOrigin(req)) throw new ApiError('forbidden', 403);
    const user = await requireUser();
    await rateLimit(`activity:${user.id}`, 40);
    if (Number(req.headers.get('content-length')) > 150000) throw new ApiError('invalid', 413);
    const body = await req.json();
    if (body.expectedUserId !== undefined && body.expectedUserId !== user.id)
      throw new ApiError('forbidden', 403);
    if (body.action === 'sync') {
      const data = healthSyncInput.parse(body);
      await db.$transaction(async (tx) => {
        if (data.steps !== null || data.activeCalories !== null || data.distanceKm !== null) {
          const totals = {
            source: data.source,
            steps: data.steps ?? 0,
            activeCalories: data.activeCalories,
            distanceKm: data.distanceKm,
          };
          await tx.dailySteps.upsert({
            where: { userId_date: { userId: user.id, date: data.date } },
            create: { userId: user.id, date: data.date, ...totals },
            update: { ...totals, syncedAt: new Date() },
          });
        }
        for (const item of data.activities) {
          const values = {
            kind: item.kind,
            minutes: item.minutes,
            distanceKm: item.distanceKm ?? null,
            date: item.date,
          };
          await tx.cardioActivity.upsert({
            where: {
              userId_source_externalId: {
                userId: user.id,
                source: data.source,
                externalId: item.externalId,
              },
            },
            create: {
              ...values,
              userId: user.id,
              source: data.source,
              externalId: item.externalId,
            },
            update: values,
          });
        }
      });
    } else if (body.action === 'disconnect') {
      // User explicitly removes imported records; manual activity stays intact.
      await db.$transaction([
        db.dailySteps.deleteMany({ where: { userId: user.id } }),
        db.cardioActivity.deleteMany({ where: { userId: user.id, source: { not: 'manual' } } }),
      ]);
    } else throw new ApiError('invalid');
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    return failure(error);
  }
}
