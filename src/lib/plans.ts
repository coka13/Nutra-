// Plan rules. Stored tiers: FREE, PREMIUM (shown as "Plus") and COACH.
//  - Free:  ads, no AI of its own.
//  - Plus:  no ads, no AI of its own.
//  - Coach: up to COACH_CLIENT_LIMIT clients, AI, no ads.
// AI is unlocked for any client with an accepted link to a paying coach.
// Charged amounts come from the Stripe price IDs; these numbers are for display only.
export const PLAN_PRICE_USD = { PREMIUM: 5, COACH: 30 } as const;
export const COACH_CLIENT_LIMIT = 10;

export type PaidTier = 'FREE' | 'PREMIUM' | 'COACH';
type Sub = { tier: string; status: string } | null | undefined;

/** The tier the user is actually entitled to right now. */
export function activeTier(sub: Sub): PaidTier {
  if (!sub || sub.status !== 'ACTIVE') return 'FREE';
  return sub.tier === 'COACH' || sub.tier === 'PREMIUM' ? sub.tier : 'FREE';
}

/**
 * How many clients (active + pending) a coach may have. Without a billing provider
 * (local development) coach accounts get the paid allowance so the product stays usable.
 */
export function clientCapacity(role: string, sub: Sub, billingOn: boolean) {
  if (role !== 'COACH') return 0;
  if (activeTier(sub) === 'COACH' || !billingOn) return COACH_CLIENT_LIMIT;
  return 0;
}

export const isPaidCoach = (role: string, sub: Sub, billingOn: boolean) =>
  clientCapacity(role, sub, billingOn) > 0;

export type Entitlements = { plan: PaidTier; ai: boolean; ads: boolean; clientLimit: number };

export function entitlements(input: {
  role: string;
  sub: Sub;
  billingOn: boolean;
  /** Coaches with an ACTIVE (accepted) link to this user. */
  coaches: { role: string; subscription: Sub }[];
}): Entitlements {
  const plan = activeTier(input.sub),
    paidCoach = isPaidCoach(input.role, input.sub, input.billingOn);
  return {
    plan,
    ai:
      paidCoach || input.coaches.some((c) => isPaidCoach(c.role, c.subscription, input.billingOn)),
    ads: plan === 'FREE' && !paidCoach && input.role !== 'ADMIN',
    clientLimit: clientCapacity(input.role, input.sub, input.billingOn),
  };
}
