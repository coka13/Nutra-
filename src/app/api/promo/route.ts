import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ApiError, audit, rateLimit, requireUser } from '@/lib/auth';
import { acceptsOrigin } from '@/lib/request-origin';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };

/**
 * Redeems an administrator-created promotion as complimentary access. It never touches
 * in-app purchases or payment-provider subscriptions.
 */
export async function POST(req: NextRequest) {
  try {
    if (!acceptsOrigin(req)) throw new ApiError('forbidden', 403);
    const user = await requireUser();
    await rateLimit(`promo:${user.id}`, 5);
    const { code } = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{4,32}$/) }).parse(await req.json());
    const now = new Date();
    const grant = await db.$transaction(async (tx) => {
      const promotion = await tx.promotion.findUnique({ where: { code } });
      if (
        !promotion ||
        !promotion.active ||
        promotion.startsAt > now ||
        (promotion.endsAt && promotion.endsAt < now) ||
        (promotion.audience !== 'ALL' && promotion.audience !== user.role)
      )
        throw new ApiError('promoInvalid', 400);
      const claimed = await tx.promotion.updateMany({
        where: { id: promotion.id, ...(promotion.maxRedemptions != null && { redemptions: { lt: promotion.maxRedemptions } }) },
        data: { redemptions: { increment: 1 } },
      });
      if (!claimed.count) throw new ApiError('promoExhausted', 409);
      return tx.entitlementGrant.create({
        data: {
          userId: user.id,
          kind: promotion.kind,
          source: 'PROMO',
          reason: `Promotion ${promotion.code}`,
          promotionId: promotion.id,
          endsAt: new Date(+now + promotion.days * 86400000),
        },
        select: { kind: true, endsAt: true },
      });
    });
    await audit(user.id, 'promo/redeem');
    return NextResponse.json({ grant }, { headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return NextResponse.json({ error: 'promoUsed' }, { status: 409, headers });
    const status = error instanceof ApiError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500;
    return NextResponse.json({ error: error instanceof ApiError ? error.code : status === 400 ? 'invalid' : 'serverError' }, { status, headers });
  }
}
