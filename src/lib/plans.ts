// Plan rules. Stored tiers: FREE, PREMIUM (shown as "Plus") and COACH.
//  - Free:  ads, no AI of its own.
//  - Plus:  no ads, no AI of its own.
//  - Coach: up to COACH_CLIENT_LIMIT clients, AI, no ads.
// Accepted coach clients have no ads. AI requires an eligible paying coach.
// Charged amounts come from the Stripe price IDs; these numbers are for display only.
// Administrators can tune the per-tier features, client limit and exclusions through
// remote configuration (`rules`) and grant complimentary access (`grants`); without
// either, the defaults below apply unchanged.
export const PLAN_PRICE_USD = { PREMIUM: 5, COACH: 30 } as const;
export const COACH_CLIENT_LIMIT = 10;

/** Public monthly coach offers; checkout is unavailable until billing is configured. */
export const COACH_PACKAGES = [
  { key: 'coachStarter', price: 30, clientLimit: 10 },
  { key: 'coachAdvanced', price: 50, clientLimit: 20 },
  { key: 'coachProfessional', price: 70, clientLimit: 30 },
  { key: 'coachPremium', price: 90, clientLimit: 60 },
] as const;

export type PaidTier = 'FREE' | 'PREMIUM' | 'COACH';
type Sub = { tier: string; status: string } | null | undefined;
export type GrantKind = 'PREMIUM' | 'AD_FREE' | 'COACH' | 'AI';
/** Administrator-tunable rules; see remote-config.ts. */
export type PlanRules = {
  coachClientLimit: number;
  coachClientsGetAi: boolean;
  tiers: Record<PaidTier, { ads: boolean; ai: boolean }>;
  adsEnabled: boolean;
  aiEnabled: boolean;
  excludeCoachClients: boolean;
};
export const DEFAULT_RULES: PlanRules = {
  coachClientLimit: COACH_CLIENT_LIMIT,
  coachClientsGetAi: true,
  tiers: { FREE: { ads: true, ai: false }, PREMIUM: { ads: false, ai: false }, COACH: { ads: false, ai: true } },
  adsEnabled: true,
  aiEnabled: true,
  excludeCoachClients: true,
};
export type CoachControls = {
  /** APPROVED coaches may take clients; PENDING, REJECTED or REVOKED may not. */
  coachStatus?: string;
  /** Per-coach override of the plan allowance. */
  coachClientLimit?: number | null;
};

/** The tier the user is actually entitled to right now. */
export function activeTier(sub: Sub, grants: readonly string[] = []): PaidTier {
  const paid =
    sub && sub.status === 'ACTIVE' && (sub.tier === 'COACH' || sub.tier === 'PREMIUM')
      ? sub.tier
      : 'FREE';
  if (paid !== 'FREE') return paid;
  if (grants.includes('COACH')) return 'COACH';
  if (grants.includes('PREMIUM')) return 'PREMIUM';
  return 'FREE';
}

/**
 * How many clients (active + pending) a coach may have. Without a billing provider
 * (local development) coach accounts get the paid allowance so the product stays usable.
 */
export function clientCapacity(
  role: string,
  sub: Sub,
  billingOn: boolean,
  controls: CoachControls & { grants?: readonly string[]; rules?: PlanRules } = {},
) {
  if (role !== 'COACH') return 0;
  if (controls.coachStatus && controls.coachStatus !== 'APPROVED') return 0;
  const limit = controls.coachClientLimit ?? (controls.rules ?? DEFAULT_RULES).coachClientLimit;
  if (activeTier(sub, controls.grants) === 'COACH' || !billingOn) return limit;
  return 0;
}

export const isPaidCoach = (
  role: string,
  sub: Sub,
  billingOn: boolean,
  controls?: CoachControls & { grants?: readonly string[]; rules?: PlanRules },
) => role === 'COACH' && (activeTier(sub, controls?.grants) === 'COACH' || !billingOn) &&
  (!controls?.coachStatus || controls.coachStatus === 'APPROVED');

export type Entitlements = { plan: PaidTier; ai: boolean; ads: boolean; clientLimit: number };

export function entitlements(input: {
  role: string;
  sub: Sub;
  billingOn: boolean;
  /** Coaches with an ACTIVE (accepted) link to this user. */
  coaches: { role: string; subscription: Sub; coachStatus?: string; grants?: readonly string[] }[];
  /** Active complimentary/promotional grants (kinds). */
  grants?: readonly string[];
  rules?: PlanRules;
  coach?: CoachControls;
  /** Known to be under 18: never shown ads. */
  minor?: boolean;
}): Entitlements {
  const rules = input.rules ?? DEFAULT_RULES,
    grants = input.grants ?? [],
    plan = activeTier(input.sub, grants),
    controls = { ...input.coach, grants, rules },
    paidCoach = isPaidCoach(input.role, input.sub, input.billingOn, controls),
    coachedByPaid = input.coaches.some((c) =>
      isPaidCoach(c.role, c.subscription, input.billingOn, { coachStatus: c.coachStatus, grants: c.grants }),
    ),
    hasCoach = input.coaches.some((coach) => coach.role === 'COACH');
  return {
    plan,
    ai:
      rules.aiEnabled &&
      ((paidCoach && rules.tiers.COACH.ai) ||
        (coachedByPaid && rules.coachClientsGetAi) ||
        (plan !== 'COACH' && rules.tiers[plan].ai) ||
        grants.includes('AI')),
    ads:
      rules.adsEnabled &&
      rules.tiers[plan].ads &&
      !paidCoach &&
      input.role !== 'ADMIN' &&
      !(rules.excludeCoachClients && hasCoach) &&
      !grants.includes('AD_FREE') &&
      !input.minor,
    clientLimit: clientCapacity(input.role, input.sub, input.billingOn, controls),
  };
}

/** Under 18 from the profile's birth year (unknown age is not treated as a minor). */
export function isMinor(birthYear: number | null | undefined, now = new Date()) {
  return !!birthYear && now.getFullYear() - birthYear < 18;
}
