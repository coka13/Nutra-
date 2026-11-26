import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, rateLimit, requireUser } from '@/lib/auth';
import { acceptsOrigin } from '@/lib/request-origin';
export const runtime = 'nodejs';

const token = z.string().regex(/^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]{10,200}\]$/);

/** Registers (or with `remove: true` forgets) this device's Expo push token for the user. */
export async function POST(req: NextRequest) {
  try {
    if (!acceptsOrigin(req)) throw new ApiError('forbidden', 403);
    const user = await requireUser();
    await rateLimit(`push:${user.id}`, 10);
    const input = z.object({ token, platform: z.enum(['ios', 'android']), remove: z.boolean().default(false) }).parse(await req.json());
    if (input.remove) await db.pushToken.deleteMany({ where: { token: input.token, userId: user.id } });
    else
      await db.pushToken.upsert({
        where: { token: input.token },
        create: { token: input.token, userId: user.id, platform: input.platform },
        // A device that changes accounts belongs to the latest one.
        update: { userId: user.id, platform: input.platform },
      });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    return NextResponse.json({ error: error instanceof ApiError ? error.code : 'invalid' }, { status });
  }
}
