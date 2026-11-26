import fs from 'node:fs/promises';
import { db } from '@/lib/db';
import { getConfig } from '@/lib/remote-config';
import { activeGrantWhere } from '@/lib/access';
import { databaseFile } from '@/lib/jobs';

const DAY = 86400000;
export const isoDay = (date: Date) => date.toISOString().slice(0, 10);
export function dayRange(from: Date, to: Date) {
  const days: string[] = [];
  for (let t = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()); t <= +to; t += DAY)
    days.push(isoDay(new Date(t)));
  return days;
}
export const growth = (current: number, previous: number) =>
  previous === 0 ? (current === 0 ? 0 : null) : Math.round(((current - previous) / previous) * 1000) / 10;

const appUsers = { role: { not: 'ADMIN' } };

async function distinctActive(fromDay: string, toDay: string) {
  const rows = await db.userActivityDay.groupBy({ by: ['userId'], where: { date: { gte: fromDay, lte: toDay } } });
  return rows.length;
}

/** Share of users registered in the window who came back at least 7 days after signing up. */
async function retention(from: Date, to: Date) {
  const cohort = await db.user.findMany({
    where: { ...appUsers, createdAt: { gte: from, lte: to } },
    select: { id: true, createdAt: true },
    take: 20000,
  });
  const eligible = cohort.filter((u) => +u.createdAt + 7 * DAY <= Date.now());
  if (!eligible.length) return { cohort: 0, retained: 0, rate: null as number | null };
  let retained = 0;
  for (let i = 0; i < eligible.length; i += 500) {
    const chunk = eligible.slice(i, i + 500);
    const rows = await db.userActivityDay.findMany({
      where: { userId: { in: chunk.map((u) => u.id) } },
      select: { userId: true, date: true },
    });
    const signup = new Map(chunk.map((u) => [u.id, isoDay(new Date(+u.createdAt + 7 * DAY))]));
    retained += new Set(rows.filter((r) => r.date >= signup.get(r.userId)!).map((r) => r.userId)).size;
  }
  return { cohort: eligible.length, retained, rate: Math.round((retained / eligible.length) * 1000) / 10 };
}

export async function storageUsage() {
  const file = databaseFile();
  const [dbBytes, blobs] = await Promise.all([
    file
      ? Promise.all(['', '-wal'].map((suffix) => fs.stat(file + suffix).then((s) => s.size).catch(() => 0))).then((s) => s[0] + s[1])
      : Promise.resolve(0),
    db.$queryRawUnsafe<{ photos: bigint | number | null; logos: bigint | number | null; backgrounds: bigint | number | null }[]>(
      `SELECT (SELECT COALESCE(SUM(length(image)),0) FROM ProgressPhoto) AS photos,
              (SELECT COALESCE(SUM(length(image)),0) FROM BrandLogo) AS logos,
              (SELECT COALESCE(SUM(length(image)),0) FROM BrandBackground) AS backgrounds`,
    ),
  ]);
  const row = blobs[0] ?? { photos: 0, logos: 0, backgrounds: 0 };
  return {
    databaseBytes: dbBytes,
    photoBytes: Number(row.photos ?? 0),
    brandingBytes: Number(row.logos ?? 0) + Number(row.backgrounds ?? 0),
  };
}

async function periodNumbers(from: Date, to: Date) {
  const [registrations, aiAgg, aiFailures, payments, cancellations, metrics] = await Promise.all([
    db.user.count({ where: { ...appUsers, createdAt: { gte: from, lte: to } } }),
    db.aIUsage.aggregate({
      where: { createdAt: { gte: from, lte: to } },
      _count: true,
      _sum: { promptTokens: true, completionTokens: true, costMicros: true },
    }),
    db.aIUsage.count({ where: { createdAt: { gte: from, lte: to }, success: false } }),
    db.payment.findMany({ where: { createdAt: { gte: from, lte: to }, status: 'paid' }, select: { amount: true, currency: true } }),
    db.subscription.count({ where: { canceledAt: { gte: from, lte: to } } }),
    db.apiMetric.aggregate({
      where: { hour: { gte: from.toISOString().slice(0, 13), lte: to.toISOString().slice(0, 13) } },
      _sum: { count: true, errors: true, totalMs: true },
    }),
  ]);
  const requests = metrics._sum.count ?? 0;
  return {
    registrations,
    activeUsers: await distinctActive(isoDay(from), isoDay(to)),
    aiRequests: aiAgg._count,
    aiFailures,
    aiTokens: (aiAgg._sum.promptTokens ?? 0) + (aiAgg._sum.completionTokens ?? 0),
    aiCostUsd: (aiAgg._sum.costMicros ?? 0) / 1e6,
    revenueCents: payments.reduce((sum, p) => sum + p.amount, 0),
    revenueCurrencies: [...new Set(payments.map((p) => p.currency))],
    cancellations,
    requests,
    errorRate: requests ? Math.round(((metrics._sum.errors ?? 0) / requests) * 10000) / 100 : 0,
    avgLatencyMs: requests ? Math.round((metrics._sum.totalMs ?? 0) / requests) : 0,
  };
}

export async function dashboard(from: Date, to: Date) {
  const length = +to - +from;
  const prevTo = new Date(+from - 1),
    prevFrom = new Date(+from - length - 1);
  const today = isoDay(new Date());
  const [config, current, previous, totals, series, storage, cohort] = await Promise.all([
    getConfig(),
    periodNumbers(from, to),
    periodNumbers(prevFrom, prevTo),
    (async () => {
      const [users, coaches, trainees, coached, suspended, pendingCoaches, premium, coachSubs, adFreeGrants, compGrants, pendingCancel] =
        await Promise.all([
          db.user.count({ where: appUsers }),
          db.user.count({ where: { role: 'COACH' } }),
          db.user.count({ where: { role: 'INDEPENDENT' } }),
          db.user.count({ where: { role: 'INDEPENDENT', clientLinks: { some: { status: 'ACTIVE' } } } }),
          db.user.count({ where: { ...appUsers, status: 'SUSPENDED' } }),
          db.user.count({ where: { role: 'COACH', coachStatus: 'PENDING' } }),
          db.subscription.count({ where: { status: 'ACTIVE', tier: 'PREMIUM' } }),
          db.subscription.count({ where: { status: 'ACTIVE', tier: 'COACH' } }),
          db.entitlementGrant.groupBy({ by: ['userId'], where: { ...activeGrantWhere(), kind: { in: ['AD_FREE', 'PREMIUM'] } } }),
          db.entitlementGrant.count({ where: activeGrantWhere() }),
          db.subscription.count({ where: { status: 'ACTIVE', cancelAtPeriodEnd: true } }),
        ]);
      return { users, coaches, trainees, coached, independent: trainees - coached, suspended, pendingCoaches, premium, coachSubs, adFreeGrants: adFreeGrants.length, compGrants, pendingCancel };
    })(),
    (async () => {
      const days = dayRange(from, to);
      const [signups, active, ai, pay, errs] = await Promise.all([
        db.user.findMany({ where: { ...appUsers, createdAt: { gte: from, lte: to } }, select: { createdAt: true } }),
        db.userActivityDay.groupBy({ by: ['date'], where: { date: { gte: days[0], lte: days[days.length - 1] } }, _count: true }),
        db.aIUsage.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { createdAt: true, costMicros: true } }),
        db.payment.findMany({ where: { createdAt: { gte: from, lte: to }, status: 'paid' }, select: { createdAt: true, amount: true } }),
        db.apiMetric.findMany({ where: { hour: { gte: from.toISOString().slice(0, 13), lte: to.toISOString().slice(0, 13) } }, select: { hour: true, count: true, errors: true } }),
      ]);
      const map = new Map(days.map((d) => [d, { date: d, registrations: 0, dau: 0, aiCostUsd: 0, revenue: 0, requests: 0, errors: 0 }]));
      for (const s of signups) map.get(isoDay(s.createdAt)) && map.get(isoDay(s.createdAt))!.registrations++;
      for (const a of active) if (map.has(a.date)) map.get(a.date)!.dau = a._count;
      for (const a of ai) if (map.has(isoDay(a.createdAt))) map.get(isoDay(a.createdAt))!.aiCostUsd += a.costMicros / 1e6;
      for (const p of pay) if (map.has(isoDay(p.createdAt))) map.get(isoDay(p.createdAt))!.revenue += p.amount / 100;
      for (const m of errs) {
        const row = map.get(m.hour.slice(0, 10));
        if (row) {
          row.requests += m.count;
          row.errors += m.errors;
        }
      }
      return [...map.values()].map((r) => ({ ...r, aiCostUsd: Math.round(r.aiCostUsd * 10000) / 10000 }));
    })(),
    storageUsage(),
    retention(from, to),
  ]);
  const [dau, wau, mau] = await Promise.all([
    distinctActive(today, today),
    distinctActive(isoDay(new Date(Date.now() - 6 * DAY)), today),
    distinctActive(isoDay(new Date(Date.now() - 29 * DAY)), today),
  ]);
  const months = new Set(dayRange(from, to).map((d) => d.slice(0, 7)));
  const [adRevenue, adImpressions] = await Promise.all([
    db.adRevenue.aggregate({ where: { month: { in: [...months] } }, _sum: { amountCents: true } }),
    db.adStatDay.aggregate({ where: { date: { gte: isoDay(from), lte: isoDay(to) } }, _sum: { impressions: true, clicks: true } }),
  ]);
  const prices = config.plans.pricesUsd;
  return {
    range: { from, to, previousFrom: prevFrom, previousTo: prevTo },
    totals,
    activity: { dau, wau, mau, stickiness: mau ? Math.round((dau / mau) * 1000) / 10 : 0 },
    current,
    previous,
    growth: {
      registrations: growth(current.registrations, previous.registrations),
      activeUsers: growth(current.activeUsers, previous.activeUsers),
      revenue: growth(current.revenueCents, previous.revenueCents),
      aiCost: growth(current.aiCostUsd, previous.aiCostUsd),
      cancellations: growth(current.cancellations, previous.cancellations),
    },
    retention: cohort,
    revenue: {
      /** Estimate: active paid subscriptions × configured list price. */
      mrrUsd: totals.premium * prices.PREMIUM + totals.coachSubs * prices.COACH,
      adRevenueCents: adRevenue._sum.amountCents ?? 0,
      adImpressions: adImpressions._sum.impressions ?? 0,
      adClicks: adImpressions._sum.clicks ?? 0,
    },
    storage,
    series,
  };
}
