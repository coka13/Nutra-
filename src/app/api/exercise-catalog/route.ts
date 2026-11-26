import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, rateLimit, requireUser } from '@/lib/auth';
import { catalogQuery, loadCatalog } from '@/lib/exercise-catalog';
import { acceptsOrigin } from '@/lib/request-origin';
import { db } from '@/lib/db';
import { applyExerciseOverrides } from '@/lib/content-overrides';
import { getFreeExercise, hasExerciseAnimation } from '@/lib/free-exercises';

const headers = { 'Cache-Control': 'private, no-store' };
function failure(error: unknown) {
  const message =
    error instanceof ApiError
      ? error.code
      : error instanceof z.ZodError
        ? 'invalid'
        : error instanceof Error && error.message === 'catalogRateLimited'
          ? 'catalogRateLimited'
          : 'catalogUnavailable';
  return NextResponse.json(
    { error: message },
    {
      status: error instanceof ApiError ? error.status : error instanceof z.ZodError ? 400 : 503,
      headers,
    },
  );
}
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    await rateLimit(`catalog:${user.id}`, 40);
    const query = catalogQuery.parse(Object.fromEntries(req.nextUrl.searchParams));
    const page = await loadCatalog(query);
    return NextResponse.json(
      { ...page, results: await applyExerciseOverrides(page.results) },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    if (!acceptsOrigin(req)) throw new ApiError('forbidden', 403);
    const user = await requireUser();
    await rateLimit(`catalog-import:${user.id}`, 30);
    const { id } = z
      .object({ id: z.string().regex(/^(?:fe_[-A-Za-z0-9_]+|fl_[0-9]{4}|sw_[a-z0-9-]+)$/) })
      .parse(await req.json());
    const exercise = getFreeExercise(id);
    if (!exercise) throw new ApiError('notFound', 404);
    if (!hasExerciseAnimation(exercise)) throw new ApiError('animationRequired', 400);
    await db.exercise.upsert({ where: { id }, create: exercise, update: exercise });
    return NextResponse.json({ id }, { headers });
  } catch (error) {
    return failure(error);
  }
}
