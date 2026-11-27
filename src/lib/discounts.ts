import type { Prisma, PrismaClient, Promotion } from '@prisma/client';
import { ApiError } from './auth';
import { createDiscountPlan, tierForPaypalPlan } from './paypal';

type Tier = 'PREMIUM' | 'COACH';
type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Discount promotions: `percentOff` for the first `months` of a paid plan, bought through
 * PayPal. Each user may use a discount once; `maxRedemptions` counts activated subscriptions.
 */
export async function findDiscount(
  db: Db,
  rawCode: string,
  user: { id: string; role: string },
): Promise<Promotion> {
  const code = rawCode.trim().toUpperCase();
  const now = new Date();
  const promotion = /^[A-Z0-9_-]{4,32}$/.test(code)
    ? await db.promotion.findUnique({ where: { code } })
    : null;
  if (
    !promotion ||
    promotion.kind !== 'DISCOUNT' ||
    !promotion.percentOff ||
    !promotion.months ||
    !promotion.active ||
    promotion.startsAt > now ||
    (promotion.endsAt && promotion.endsAt < now) ||
    (promotion.audience !== 'ALL' && promotion.audience !== user.role)
  )
    throw new ApiError('promoInvalid', 400);
  if (promotion.maxRedemptions != null && promotion.redemptions >= promotion.maxRedemptions)
    throw new ApiError('promoExhausted', 409);
  const sub = await db.subscription.findUnique({ where: { userId: user.id } });
  if (sub?.promotionId === promotion.id) throw new ApiError('promoUsed', 409);
  return promotion;
}

/** The PayPal plan for this discount and tier, created on first use. */
export async function discountPlanFor(db: PrismaClient, promotion: Promotion, tier: Tier) {
  const field = tier === 'COACH' ? 'paypalPlanCoach' : 'paypalPlanPremium';
  if (promotion[field]) return promotion[field]!;
  const planId = await createDiscountPlan(tier, promotion.percentOff!, promotion.months!, promotion.code);
  // PayPal-Request-Id makes the create idempotent, so a concurrent request gets the same plan.
  await db.promotion.updateMany({ where: { id: promotion.id, [field]: null }, data: { [field]: planId } });
  return (await db.promotion.findUniqueOrThrow({ where: { id: promotion.id } }))[field]!;
}

/** Resolves a PayPal plan to its tier, including plans created for discounts. */
export async function resolvePaypalPlan(db: Db, planId: string) {
  const tier = tierForPaypalPlan(planId);
  if (tier) return { tier, promotionId: null };
  if (!planId) return { tier: null, promotionId: null };
  const promotion = await db.promotion.findFirst({
    where: { OR: [{ paypalPlanPremium: planId }, { paypalPlanCoach: planId }] },
    select: { id: true, paypalPlanCoach: true },
  });
  if (!promotion) return { tier: null, promotionId: null };
  return {
    tier: (promotion.paypalPlanCoach === planId ? 'COACH' : 'PREMIUM') as Tier,
    promotionId: promotion.id,
  };
}
