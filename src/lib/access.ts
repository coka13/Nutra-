import { db } from './db';
import { billingConfigured } from './billing';
import { entitlements, isMinor, type PlanRules } from './plans';
import { getConfig, type RemoteConfig } from './remote-config';

export function planRules(config: RemoteConfig): PlanRules {
  return {
    coachClientLimit: config.plans.coachClientLimit,
    coachClientsGetAi: config.plans.coachClientsGetAi,
    tiers: config.plans.tiers,
    adsEnabled: config.ads.enabled,
    aiEnabled: config.ai.enabled,
    excludeCoachClients: config.ads.excludeCoachClients,
  };
}

export const activeGrantWhere = (now = new Date()) => ({
  revokedAt: null,
  startsAt: { lte: now },
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

export async function activeGrantKinds(userId: string) {
  const rows = await db.entitlementGrant.findMany({
    where: { userId, ...activeGrantWhere() },
    select: { kind: true },
  });
  return [...new Set(rows.map((row) => row.kind))];
}

/** The complete entitlement decision for one user, as enforced by the API. */
export async function userEntitlements(u: {
  id: string;
  role: string;
  coachStatus?: string;
  coachClientLimit?: number | null;
  subscription: { tier: string; status: string } | null;
  profile?: { birthYear: number | null } | null;
}) {
  const now = new Date();
  const [config, grants, links] = await Promise.all([
    getConfig(),
    activeGrantKinds(u.id),
    db.coachRelationship.findMany({
      where: { clientId: u.id, status: 'ACTIVE' },
      select: {
        coach: {
          select: {
            role: true,
            coachStatus: true,
            subscription: { select: { tier: true, status: true } },
            grants: { where: activeGrantWhere(now), select: { kind: true } },
          },
        },
      },
    }),
  ]);
  return entitlements({
    role: u.role,
    sub: u.subscription,
    billingOn: billingConfigured(),
    coaches: links.map(({ coach }) => ({
      role: coach.role,
      subscription: coach.subscription,
      coachStatus: coach.coachStatus,
      grants: coach.grants.map((g) => g.kind),
    })),
    grants,
    rules: planRules(config),
    coach: { coachStatus: u.coachStatus, coachClientLimit: u.coachClientLimit },
    minor: isMinor(u.profile?.birthYear),
  });
}
