import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, rateLimit, requireUser } from '@/lib/auth';
import { acceptsOrigin } from '@/lib/request-origin';
export const runtime = 'nodejs';

const PLACEMENTS = ['dashboard', 'nutrition', 'workouts', 'mobileBanner'] as const;

/** Aggregate impression/click counters per day and placement; no per-user ad history is kept. */
export async function POST(req: NextRequest) {
  try {
    if (!acceptsOrigin(req)) throw new ApiError('forbidden', 403);
    const user = await requireUser();
    await rateLimit(`ads:${user.id}`, 30);
    const input = z.object({ placement: z.enum(PLACEMENTS), kind: z.enum(['impression', 'click']) }).parse(await req.json());
    const date = new Date().toISOString().slice(0, 10);
    const field = input.kind === 'click' ? 'clicks' : 'impressions';
    await db.adStatDay.upsert({
      where: { date_placement: { date, placement: input.placement } },
      create: { date, placement: input.placement, [field]: 1 },
      update: { [field]: { increment: 1 } },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    return NextResponse.json({ error: error instanceof ApiError ? error.code : 'invalid' }, { status });
  }
}
