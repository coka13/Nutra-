import { z } from 'zod';
import { db } from './db';

/**
 * Remote configuration. Every field has a safe default, so an empty or partially invalid
 * stored document still yields a working app. Versions are append-only; rollback appends a copy.
 */
const bool = (value: boolean) => z.boolean().default(value);
const shortText = z.string().trim().max(500).default('');
const version = z
  .string()
  .trim()
  .regex(/^\d{1,4}(\.\d{1,4}){0,2}$/, 'version')
  .default('0.0.0');
const tierFeatures = (ads: boolean, ai: boolean) =>
  z.object({ ads: bool(ads), ai: bool(ai) }).prefault({});
const usd = z.number().min(0).max(100000);
const limit = z.number().int().min(0).max(1000000);
const providerId = z.enum(['openai', 'anthropic', 'gemini', 'groq', 'openrouter']);

export const configSchema = z.object({
  features: z
    .object({
      userRegistration: bool(true),
      coachRegistration: bool(true),
      /** New coach accounts wait for administrator approval before inviting clients. */
      coachApprovalRequired: bool(false),
      beta: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]{1,39}$/), z.boolean()).default({}),
    })
    .prefault({}),
  maintenance: z
    .object({ enabled: bool(false), messageEn: shortText, messageHe: shortText })
    .prefault({}),
  app: z
    .object({
      minimumVersion: version,
      latestVersion: version,
      updateMode: z.enum(['none', 'optional', 'mandatory']).default('none'),
      noticeEn: shortText,
      noticeHe: shortText,
    })
    .prefault({}),
  plans: z
    .object({
      /** Display prices. Charged amounts always come from the payment provider's price. */
      pricesUsd: z.object({ PREMIUM: usd.default(5), COACH: usd.default(30) }).prefault({}),
      /** Optional Stripe price IDs replacing STRIPE_PRICE_*; validated against Stripe on save. */
      stripePriceIds: z
        .object({
          PREMIUM: z.string().trim().max(100).regex(/^(price_[A-Za-z0-9]+)?$/).default(''),
          COACH: z.string().trim().max(100).regex(/^(price_[A-Za-z0-9]+)?$/).default(''),
        })
        .prefault({}),
      coachClientLimit: z.number().int().min(0).max(1000).default(10),
      coachClientsGetAi: bool(true),
      tiers: z
        .object({
          FREE: tierFeatures(true, false),
          PREMIUM: tierFeatures(false, false),
          COACH: tierFeatures(false, true),
        })
        .prefault({}),
    })
    .prefault({}),
  ai: z
    .object({
      enabled: bool(true),
      features: z
        .object({ chat: bool(true), photo: bool(true), plan: bool(true), copilot: bool(true) })
        .prefault({}),
      /** Empty = environment-configured provider (OPENAI_* variables). */
      defaultProvider: z.union([providerId, z.literal('')]).default(''),
      fallbackProviders: z.array(providerId).max(5).default([]),
      /** 0 = no limit. */
      monthlyBudgetUsd: usd.default(0),
      globalMonthlyRequests: limit.default(0),
      perUserMonthlyRequests: limit.default(200),
    })
    .prefault({}),
  ads: z
    .object({
      enabled: bool(true),
      placements: z
        .object({
          dashboard: bool(true),
          nutrition: bool(true),
          workouts: bool(true),
          mobileBanner: bool(true),
        })
        .prefault({}),
      /** Minimum seconds between ad refreshes on one screen. */
      minIntervalSeconds: z.number().int().min(0).max(86400).default(60),
      maxImpressionsPerDay: limit.default(30),
      excludeCoachClients: bool(true),
      /** Minors never receive ads; not configurable. */
      excludeMinors: z.literal(true).default(true),
      nonPersonalizedOnly: bool(false),
    })
    .prefault({}),
});
export type RemoteConfig = z.infer<typeof configSchema>;
export const defaultConfig = (): RemoteConfig => configSchema.parse({});

/** Parses stored JSON; invalid sections fall back to defaults instead of breaking the app. */
export function parseStoredConfig(raw: string | null | undefined): RemoteConfig {
  if (!raw) return defaultConfig();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return defaultConfig();
  }
  const full = configSchema.safeParse(data);
  if (full.success) return full.data;
  const base = defaultConfig() as Record<string, unknown>;
  const input = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  for (const key of Object.keys(configSchema.shape) as (keyof RemoteConfig)[]) {
    const section = configSchema.shape[key].safeParse(input[key]);
    if (section.success) base[key] = section.data;
  }
  return base as RemoteConfig;
}

let cache: { at: number; version: number; config: RemoteConfig } | null = null;
const TTL = 10000;

export async function getConfigVersion() {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const latest = await db.configVersion.findFirst({ orderBy: { version: 'desc' } }).catch(() => null);
  cache = { at: Date.now(), version: latest?.version ?? 0, config: parseStoredConfig(latest?.data) };
  return cache;
}
export const getConfig = async () => (await getConfigVersion()).config;
export const invalidateConfig = () => {
  cache = null;
};

export async function publishConfig(data: unknown, createdBy: string, note: string) {
  const config = configSchema.parse(data);
  const row = await db.configVersion.create({
    data: { data: JSON.stringify(config), createdBy, note: note.slice(0, 200) },
  });
  invalidateConfig();
  return { version: row.version, config };
}

export async function rollbackConfig(target: number, createdBy: string) {
  const row = await db.configVersion.findUnique({ where: { version: target } });
  if (!row) return null;
  return publishConfig(parseStoredConfig(row.data), createdBy, `Rollback to v${target}`);
}

/** Compares dotted versions numerically; true when `current` is below `minimum`. */
export function versionBelow(current: string, minimum: string) {
  const a = current.split('.').map(Number),
    b = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0,
      y = b[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}

/** The subset clients may see: no budgets, price IDs or provider choices. */
export function publicConfig(config: RemoteConfig, version: number) {
  return {
    version,
    features: config.features,
    maintenance: config.maintenance,
    app: config.app,
    prices: config.plans.pricesUsd,
    ai: { enabled: config.ai.enabled, features: config.ai.features },
    ads: {
      enabled: config.ads.enabled,
      placements: config.ads.placements,
      minIntervalSeconds: config.ads.minIntervalSeconds,
      maxImpressionsPerDay: config.ads.maxImpressionsPerDay,
      nonPersonalizedOnly: config.ads.nonPersonalizedOnly,
    },
  };
}
