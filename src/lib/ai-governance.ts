import { AsyncLocalStorage } from 'node:async_hooks';
import { db } from './db';
import { ApiError } from './auth';
import { decryptSecret } from './admin/crypto';
import { getConfig } from './remote-config';

/** All providers below expose an OpenAI-compatible chat completions endpoint. */
export const PROVIDER_PRESETS = {
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', textModel: 'gpt-4.1-mini', inputCostPerM: 0.4, outputCostPerM: 1.6 },
  anthropic: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', textModel: 'claude-haiku-5-5', inputCostPerM: 1, outputCostPerM: 5 },
  gemini: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', textModel: 'gemini-2.5-flash', inputCostPerM: 0.3, outputCostPerM: 2.5 },
  groq: { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', textModel: 'llama-3.3-70b-versatile', inputCostPerM: 0.59, outputCostPerM: 0.79 },
  // Free models, tried in order (busy ones are skipped). The first also reads meal photos.
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    textModel:
      'nvidia/nemotron-3.5-super-vl:free, nvidia/nemotron-3-ultra-550b-a55b:free, nvidia/nemotron-3.5-lightning:free, google/gemma-4-31b-it:free',
    inputCostPerM: 0,
    outputCostPerM: 0,
  },
} as const;
export type ProviderId = keyof typeof PROVIDER_PRESETS;
export const PROVIDER_IDS = Object.keys(PROVIDER_PRESETS) as ProviderId[];

export type AiFeature = 'chat' | 'copilot' | 'photo' | 'plan';
/** Set by the API around an AI call so usage is attributed without threading arguments. */
export const aiContext = new AsyncLocalStorage<{ userId?: string; feature: string }>();

export type AiRoute = {
  provider: string;
  baseUrl: string;
  key: string;
  model: string;
  inputCostPerM: number;
  outputCostPerM: number;
};

let providerCache: { at: number; rows: Awaited<ReturnType<typeof db.aIProvider.findMany>> } | null = null;
async function providers() {
  if (providerCache && Date.now() - providerCache.at < 15000) return providerCache.rows;
  const rows = await db.aIProvider.findMany().catch(() => []);
  providerCache = { at: Date.now(), rows };
  return rows;
}
export const invalidateProviders = () => {
  providerCache = null;
};

const list = (value: string | undefined) =>
  (value || '').split(',').map((m) => m.trim()).filter(Boolean);

function envProvider() {
  const base = process.env.OPENAI_BASE_URL || '';
  return base.includes('openrouter') ? 'openrouter' : base.includes('groq') ? 'groq' : 'openai';
}

/**
 * Ordered attempts for one request. Administrator-configured providers (default first, then
 * fallbacks) take precedence; otherwise the original OPENAI_* environment setup is used.
 */
export async function resolveRoutes(kind: 'text' | 'vision'): Promise<AiRoute[]> {
  const [config, rows] = await Promise.all([getConfig(), providers()]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chosen = [config.ai.defaultProvider, ...config.ai.fallbackProviders].filter(
    (id, i, all): id is ProviderId => !!id && all.indexOf(id) === i,
  );
  // No provider picked as default yet: an enabled provider with a key is still used, so
  // connecting one in the admin panel works without a second trip to the routing settings.
  const order = chosen.length
    ? chosen
    : rows.filter((row) => row.enabled && row.encryptedKey).map((row) => row.id as ProviderId);
  const routes: AiRoute[] = [];
  for (const id of order) {
    const row = byId.get(id);
    if (!row?.enabled || !row.encryptedKey) continue;
    let key: string;
    try {
      key = decryptSecret(row.encryptedKey);
    } catch {
      continue;
    }
    const models = list(kind === 'vision' ? row.visionModel || row.textModel : row.textModel);
    for (const model of models)
      routes.push({ provider: id, baseUrl: row.baseUrl, key, model, inputCostPerM: row.inputCostPerM, outputCostPerM: row.outputCostPerM });
  }
  if (routes.length || !process.env.OPENAI_API_KEY) return routes;
  const text = list(process.env.OPENAI_MODEL || 'gpt-4.1-mini').concat(list(process.env.OPENAI_FALLBACK_MODEL));
  const models = kind === 'vision' && process.env.OPENAI_VISION_MODEL ? list(process.env.OPENAI_VISION_MODEL) : text;
  const provider = envProvider(),
    pricing = byId.get(provider);
  return models.map((model) => ({
    provider,
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    key: process.env.OPENAI_API_KEY!,
    model,
    inputCostPerM: pricing?.inputCostPerM ?? 0,
    outputCostPerM: pricing?.outputCostPerM ?? 0,
  }));
}

export async function aiConfigured() {
  return (await resolveRoutes('text')).length > 0;
}

export const costMicros = (route: Pick<AiRoute, 'inputCostPerM' | 'outputCostPerM'>, input: number, output: number) =>
  Math.round(input * route.inputCostPerM + output * route.outputCostPerM);

export async function recordAiUsage(entry: {
  route: AiRoute;
  promptTokens: number;
  completionTokens: number;
  success: boolean;
  latencyMs: number;
  error?: string;
}) {
  const context = aiContext.getStore();
  await db.aIUsage
    .create({
      data: {
        userId: context?.userId ?? null,
        feature: context?.feature ?? 'other',
        provider: entry.route.provider,
        model: entry.route.model.slice(0, 120),
        promptTokens: entry.promptTokens,
        completionTokens: entry.completionTokens,
        costMicros: costMicros(entry.route, entry.promptTokens, entry.completionTokens),
        success: entry.success,
        latencyMs: entry.latencyMs,
        error: entry.error?.slice(0, 80) ?? null,
      },
    })
    .catch(() => {});
}

export const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** Enforces the administrator's AI switches, per-user and global limits and the budget. */
export async function assertAiAllowed(userId: string, feature: AiFeature) {
  const config = await getConfig();
  if (!config.ai.enabled || !config.ai.features[feature]) throw new ApiError('aiDisabled', 403);
  const since = monthStart();
  const { perUserMonthlyRequests, globalMonthlyRequests, monthlyBudgetUsd } = config.ai;
  if (perUserMonthlyRequests > 0) {
    const used = await db.aIUsage.count({ where: { userId, success: true, createdAt: { gte: since } } });
    if (used >= perUserMonthlyRequests) throw new ApiError('aiLimitReached', 429);
  }
  if (globalMonthlyRequests > 0) {
    const used = await db.aIUsage.count({ where: { success: true, createdAt: { gte: since } } });
    if (used >= globalMonthlyRequests) throw new ApiError('aiLimitReached', 429);
  }
  if (monthlyBudgetUsd > 0) {
    const spent = await db.aIUsage.aggregate({ _sum: { costMicros: true }, where: { createdAt: { gte: since } } });
    if ((spent._sum.costMicros ?? 0) >= monthlyBudgetUsd * 1e6) throw new ApiError('aiBudgetReached', 503);
  }
}

/** Lightweight availability probe; never logs or returns the key. */
export async function probeProvider(baseUrl: string, key: string, provider: string) {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${key}`,
        ...(provider === 'anthropic' && { 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
      },
    });
    return { ok: response.ok, status: response.ok ? 'ok' : `http_${response.status}`, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, status: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unreachable', latencyMs: Date.now() - started };
  }
}
