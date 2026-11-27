import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/auth';
import { billingConfigured, stripeClient } from '@/lib/billing';
import { cancelPaypalSubscription, getPaypalSubscription, paypalConfigured, paypalStatus } from '@/lib/paypal';
import { configSchema, getConfigVersion, publishConfig } from '@/lib/remote-config';
import { activeGrantWhere } from '@/lib/access';
import { encryptSecret, decryptSecret, secretHint } from '../crypto';
import { invalidateProviders, probeProvider, PROVIDER_IDS, PROVIDER_PRESETS, type ProviderId } from '@/lib/ai-governance';
import { dateRange, isoDayOf, pagination, text, type Endpoint } from './types';

const DAY = 86400000;

/** Publishes one section of the configuration, leaving every other section untouched. */
async function publishSection<K extends 'plans' | 'ai' | 'ads'>(key: K, value: unknown, adminId: string, note: string) {
  const { config } = await getConfigVersion();
  const section = configSchema.shape[key].parse(value);
  return publishConfig({ ...config, [key]: section }, adminId, note || `Updated ${key}`);
}

async function verifyStripePrice(priceId: string) {
  if (!priceId) return;
  if (!billingConfigured()) throw new ApiError('billingUnavailable', 503);
  const price = await stripeClient().prices.retrieve(priceId).catch(() => null);
  if (!price || !price.active || price.type !== 'recurring') throw new ApiError('invalidPrice', 400);
}

export const billingEndpoints: Endpoint[] = [
  {
    method: 'GET',
    pattern: 'billing',
    permission: 'billing.view',
    async handler({ query }) {
      const { skip, take, page, pageSize } = pagination(query, 20);
      const [{ config }, bySub, payments, paymentTotal, promotions, grants, cancelling] = await Promise.all([
        getConfigVersion(),
        db.subscription.groupBy({ by: ['tier', 'status'], _count: true }),
        db.payment.findMany({
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          select: { id: true, amount: true, currency: true, status: true, createdAt: true, user: { select: { id: true, name: true } } },
        }),
        db.payment.count(),
        db.promotion.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
        db.entitlementGrant.groupBy({ by: ['kind', 'source'], where: activeGrantWhere(), _count: true }),
        db.subscription.findMany({
          where: { status: 'ACTIVE', cancelAtPeriodEnd: true },
          select: { tier: true, currentPeriodEnd: true, user: { select: { id: true, name: true } } },
          take: 50,
        }),
      ]);
      return {
        configured: paypalConfigured(),
        providers: {
          paypal: paypalConfigured() ? (process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox') : null,
          stripe: billingConfigured(),
        },
        plans: config.plans,
        subscriptions: bySub.map((s) => ({ tier: s.tier, status: s.status, count: s._count })),
        payments: { items: payments, total: paymentTotal, page, pageSize },
        promotions,
        grants: grants.map((g) => ({ kind: g.kind, source: g.source, count: g._count })),
        cancelling,
        environmentPrices: { PREMIUM: !!process.env.STRIPE_PRICE_PREMIUM, COACH: !!process.env.STRIPE_PRICE_COACH },
      };
    },
  },
  {
    method: 'POST',
    pattern: 'billing/plans',
    permission: 'billing.manage',
    stepUp: true,
    async handler({ body, admin }) {
      const input = z.object({ plans: z.unknown(), note: text(200).default('') }).parse(body);
      const plans = configSchema.shape.plans.parse(input.plans);
      await verifyStripePrice(plans.stripePriceIds.PREMIUM);
      await verifyStripePrice(plans.stripePriceIds.COACH);
      if (plans.stripePriceIds.PREMIUM && plans.stripePriceIds.PREMIUM === plans.stripePriceIds.COACH)
        throw new ApiError('invalidPrice', 400);
      const { version } = await publishSection('plans', plans, admin.id, input.note);
      return { version };
    },
  },
  {
    method: 'POST',
    pattern: 'billing/promotions',
    permission: 'billing.manage',
    async handler({ body, admin }) {
      const common = {
        code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{4,32}$/),
        maxRedemptions: z.number().int().min(1).max(1000000).nullable(),
        audience: z.enum(['ALL', 'INDEPENDENT', 'COACH']),
        endsAt: z.iso.date().nullable(),
      };
      // Free access for a number of days, or a percentage off the first months of a paid plan.
      const input = z
        .discriminatedUnion('kind', [
          z.object({ ...common, kind: z.literal('PREMIUM'), days: z.number().int().min(1).max(365) }),
          z.object({
            ...common,
            kind: z.literal('DISCOUNT'),
            percentOff: z.number().int().min(1).max(99),
            months: z.number().int().min(1).max(24),
          }),
        ])
        .parse(body);
      if (await db.promotion.findUnique({ where: { code: input.code } }))
        throw new ApiError('promoCodeTaken', 409);
      const promotion = await db.promotion.create({
        data: {
          ...input,
          days: input.kind === 'PREMIUM' ? input.days : 0,
          endsAt: input.endsAt ? new Date(input.endsAt + 'T23:59:59.999Z') : null,
          createdBy: admin.id,
        },
      });
      return { promotion };
    },
  },
  {
    method: 'POST',
    pattern: 'billing/promotions/:id',
    permission: 'billing.manage',
    async handler({ params, body }) {
      const { active } = z.object({ active: z.boolean() }).parse(body);
      const promotion = await db.promotion.update({ where: { id: params.id }, data: { active } });
      return { promotion };
    },
  },
  {
    method: 'POST',
    pattern: 'billing/subscriptions/:userId/cancel',
    permission: 'billing.manage',
    stepUp: true,
    async handler({ params }) {
      const sub = await db.subscription.findUnique({ where: { userId: params.userId } });
      if (!sub?.providerId) throw new ApiError('noProviderSubscription', 400);
      // PayPal ends the subscription at once; PayPal's canonical state is stored right away.
      if (sub.provider === 'paypal') {
        if (!paypalConfigured()) throw new ApiError('billingUnavailable', 503);
        await cancelPaypalSubscription(sub.providerId);
        const canonical = await getPaypalSubscription(sub.providerId);
        await db.subscription.update({
          where: { userId: params.userId },
          data: { status: paypalStatus(canonical.status), canceledAt: new Date() },
        });
        return { ok: true };
      }
      // Stripe cancels at period end; the webhook then updates local state.
      if (!billingConfigured()) throw new ApiError('billingUnavailable', 503);
      await stripeClient().subscriptions.update(sub.providerId, { cancel_at_period_end: true });
      await db.subscription.update({ where: { userId: params.userId }, data: { cancelAtPeriodEnd: true } });
      return { ok: true };
    },
  },
];

function publicProvider(id: ProviderId, row: Awaited<ReturnType<typeof db.aIProvider.findUnique>>) {
  const preset = PROVIDER_PRESETS[id];
  return {
    id,
    name: preset.name,
    baseUrl: preset.baseUrl,
    configured: !!row?.encryptedKey,
    keyHint: row?.keyHint ?? '',
    enabled: !!row?.enabled,
    textModel: row?.textModel || '',
    visionModel: row?.visionModel || '',
    inputCostPerM: row?.inputCostPerM ?? preset.inputCostPerM,
    outputCostPerM: row?.outputCostPerM ?? preset.outputCostPerM,
    suggestedModel: preset.textModel,
    lastCheckedAt: row?.lastCheckedAt ?? null,
    lastStatus: row?.lastStatus ?? 'unknown',
  };
}

export const aiEndpoints: Endpoint[] = [
  {
    method: 'GET',
    pattern: 'ai',
    permission: 'ai.view',
    async handler({ query }) {
      const { from, to } = dateRange(query);
      const where = { createdAt: { gte: from, lte: to } };
      const [{ config }, rows, byModel, byFeature, failures, daily, topUsers, monthAgg] = await Promise.all([
        getConfigVersion(),
        db.aIProvider.findMany(),
        db.aIUsage.groupBy({ by: ['provider', 'model'], where, _count: true, _sum: { promptTokens: true, completionTokens: true, costMicros: true, latencyMs: true } }),
        db.aIUsage.groupBy({ by: ['feature'], where, _count: true, _sum: { costMicros: true } }),
        db.aIUsage.groupBy({ by: ['provider', 'error'], where: { ...where, success: false }, _count: true }),
        db.aIUsage.findMany({ where, select: { createdAt: true, costMicros: true, success: true, promptTokens: true, completionTokens: true } }),
        db.aIUsage.groupBy({ by: ['userId'], where: { ...where, userId: { not: null } }, _count: true, _sum: { costMicros: true }, orderBy: { _count: { userId: 'desc' } }, take: 10 }),
        db.aIUsage.aggregate({ where: { createdAt: { gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)) } }, _sum: { costMicros: true }, _count: true }),
      ]);
      const byId = new Map(rows.map((r) => [r.id, r]));
      const names = await db.user.findMany({ where: { id: { in: topUsers.map((u) => u.userId!) } }, select: { id: true, name: true } });
      const nameMap = new Map(names.map((n) => [n.id, n.name]));
      const series = new Map<string, { date: string; requests: number; failures: number; tokens: number; costUsd: number }>();
      for (let t = +from; t <= +to; t += DAY) {
        const d = isoDayOf(new Date(t));
        series.set(d, { date: d, requests: 0, failures: 0, tokens: 0, costUsd: 0 });
      }
      for (const row of daily) {
        const s = series.get(isoDayOf(row.createdAt));
        if (!s) continue;
        s.requests++;
        if (!row.success) s.failures++;
        s.tokens += row.promptTokens + row.completionTokens;
        s.costUsd += row.costMicros / 1e6;
      }
      return {
        settings: config.ai,
        providers: PROVIDER_IDS.map((id) => publicProvider(id, byId.get(id) ?? null)),
        environment: {
          configured: !!process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL || (process.env.OPENAI_API_KEY ? 'gpt-4.1-mini' : ''),
          fallbacks: process.env.OPENAI_FALLBACK_MODEL || '',
          baseUrl: process.env.OPENAI_BASE_URL ? new URL(process.env.OPENAI_BASE_URL).host : 'api.openai.com',
        },
        month: { costUsd: (monthAgg._sum.costMicros ?? 0) / 1e6, requests: monthAgg._count },
        byModel: byModel.map((m) => ({
          provider: m.provider,
          model: m.model,
          requests: m._count,
          promptTokens: m._sum.promptTokens ?? 0,
          completionTokens: m._sum.completionTokens ?? 0,
          costUsd: (m._sum.costMicros ?? 0) / 1e6,
          avgLatencyMs: m._count ? Math.round((m._sum.latencyMs ?? 0) / m._count) : 0,
        })),
        byFeature: byFeature.map((f) => ({ feature: f.feature, requests: f._count, costUsd: (f._sum.costMicros ?? 0) / 1e6 })),
        failures: failures.map((f) => ({ provider: f.provider, error: f.error, count: f._count })),
        topUsers: topUsers.map((u) => ({ userId: u.userId, name: nameMap.get(u.userId!) ?? '—', requests: u._count, costUsd: (u._sum.costMicros ?? 0) / 1e6 })),
        series: [...series.values()].map((s) => ({ ...s, costUsd: Math.round(s.costUsd * 10000) / 10000 })),
      };
    },
  },
  {
    method: 'POST',
    pattern: 'ai/settings',
    permission: 'ai.manage',
    async handler({ body, admin }) {
      const input = z.object({ ai: z.unknown(), note: text(200).default('') }).parse(body);
      const { version } = await publishSection('ai', input.ai, admin.id, input.note);
      invalidateProviders();
      return { version };
    },
  },
  {
    method: 'POST',
    pattern: 'ai/providers/:id',
    permission: 'ai.manage',
    stepUp: true,
    async handler({ params, body }) {
      const providerId = z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]).parse(params.id);
      const preset = PROVIDER_PRESETS[providerId];
      const models = z.string().trim().max(300).regex(/^[\w.:/@-]*(,\s*[\w.:/@-]+)*$/);
      const input = z
        .object({
          enabled: z.boolean(),
          textModel: models,
          visionModel: models.default(''),
          inputCostPerM: z.number().min(0).max(1000),
          outputCostPerM: z.number().min(0).max(1000),
          // Write-only: omitted or empty keeps the saved key.
          apiKey: z.string().trim().max(400).optional(),
          clearKey: z.boolean().default(false),
        })
        .parse(body);
      const existing = await db.aIProvider.findUnique({ where: { id: providerId } });
      const keyUpdate = input.clearKey
        ? { encryptedKey: null, keyHint: '' }
        : input.apiKey
          ? { encryptedKey: encryptSecret(input.apiKey), keyHint: secretHint(input.apiKey), lastStatus: 'unknown' }
          : {};
      if (input.enabled && !input.textModel) throw new ApiError('modelRequired', 400);
      if (input.enabled && !(keyUpdate.encryptedKey ?? existing?.encryptedKey)) throw new ApiError('keyRequired', 400);
      const data = {
        name: preset.name,
        baseUrl: preset.baseUrl,
        enabled: input.enabled,
        textModel: input.textModel,
        visionModel: input.visionModel,
        inputCostPerM: input.inputCostPerM,
        outputCostPerM: input.outputCostPerM,
        updatedAt: new Date(),
        ...keyUpdate,
      };
      const row = await db.aIProvider.upsert({ where: { id: providerId }, create: { id: providerId, ...data }, update: data });
      invalidateProviders();
      return { provider: publicProvider(providerId, row), keyChanged: !!input.apiKey || input.clearKey };
    },
  },
  {
    method: 'POST',
    pattern: 'ai/providers/:id/test',
    permission: 'ai.manage',
    async handler({ params }) {
      const providerId = z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]).parse(params.id);
      const row = await db.aIProvider.findUnique({ where: { id: providerId } });
      if (!row?.encryptedKey) throw new ApiError('keyRequired', 400);
      const result = await probeProvider(row.baseUrl, decryptSecret(row.encryptedKey), providerId);
      await db.aIProvider.update({ where: { id: providerId }, data: { lastCheckedAt: new Date(), lastStatus: result.status } });
      return result;
    },
  },
];

export const adEndpoints: Endpoint[] = [
  {
    method: 'GET',
    pattern: 'ads',
    permission: 'ads.view',
    async handler({ query }) {
      const { from, to } = dateRange(query);
      const [{ config }, stats, revenue, eligible, coached, granted] = await Promise.all([
        getConfigVersion(),
        db.adStatDay.findMany({ where: { date: { gte: isoDayOf(from), lte: isoDayOf(to) } }, orderBy: { date: 'asc' } }),
        db.adRevenue.findMany({ orderBy: { month: 'desc' }, take: 24 }),
        // Free-tier, non-coached accounts: an upper bound before age and grant exclusions.
        db.user.count({
          where: {
            role: 'INDEPENDENT',
            status: 'ACTIVE',
            clientLinks: { none: { status: 'ACTIVE' } },
            OR: [{ subscription: null }, { subscription: { OR: [{ status: { not: 'ACTIVE' } }, { tier: 'FREE' }] } }],
          },
        }),
        db.user.count({ where: { role: 'INDEPENDENT', clientLinks: { some: { status: 'ACTIVE' } } } }),
        db.entitlementGrant.groupBy({ by: ['userId'], where: { ...activeGrantWhere(), kind: { in: ['AD_FREE', 'PREMIUM'] } } }),
      ]);
      const byPlacement: Record<string, { impressions: number; clicks: number }> = {};
      const byDay = new Map<string, { date: string; impressions: number; clicks: number }>();
      for (const s of stats) {
        byPlacement[s.placement] ??= { impressions: 0, clicks: 0 };
        byPlacement[s.placement].impressions += s.impressions;
        byPlacement[s.placement].clicks += s.clicks;
        const d = byDay.get(s.date) ?? { date: s.date, impressions: 0, clicks: 0 };
        d.impressions += s.impressions;
        d.clicks += s.clicks;
        byDay.set(s.date, d);
      }
      return {
        settings: config.ads,
        byPlacement,
        series: [...byDay.values()],
        revenue,
        eligibility: { freeIndependent: eligible, coachedExcluded: coached, grantExcluded: granted.length },
        admobConfigured: !!process.env.ADMOB_PUBLISHER_ID,
      };
    },
  },
  {
    method: 'POST',
    pattern: 'ads/settings',
    permission: 'ads.manage',
    async handler({ body, admin }) {
      const input = z.object({ ads: z.unknown(), note: text(200).default('') }).parse(body);
      const { version } = await publishSection('ads', input.ads, admin.id, input.note);
      return { version };
    },
  },
  {
    method: 'POST',
    pattern: 'ads/revenue',
    permission: 'ads.manage',
    async handler({ body, admin }) {
      const input = z
        .object({
          month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          network: z.enum(['admob', 'adsense', 'other']),
          amountCents: z.number().int().min(0).max(1e10),
          currency: z.string().regex(/^[a-z]{3}$/).default('usd'),
          note: text(300).default(''),
        })
        .parse(body);
      const row = await db.adRevenue.upsert({
        where: { month_network: { month: input.month, network: input.network } },
        create: { ...input, createdBy: admin.id },
        update: { amountCents: input.amountCents, currency: input.currency, note: input.note, createdBy: admin.id },
      });
      return { revenue: row };
    },
  },
];
