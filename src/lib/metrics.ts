import { db } from './db';

/**
 * Request metrics for the admin console: counts, error rates and latency per route group per
 * hour, plus a short log of failed requests. Only route group, method, status, error code and
 * duration are kept: never payloads, query strings, tokens or user identifiers.
 */
type Bucket = { count: number; errors: number; clientErrors: number; totalMs: number; maxMs: number };
type Failure = { route: string; method: string; status: number; code: string; durationMs: number; createdAt: Date };
type MetricsState = { buckets: Map<string, Bucket>; failures: Failure[]; timer?: NodeJS.Timeout };
const globalMetrics = globalThis as unknown as { nutraMetrics?: MetricsState };
const state: MetricsState = (globalMetrics.nutraMetrics ??= { buckets: new Map(), failures: [] });

export const routeGroup = (path: string) => {
  const [first = 'root', second] = path.split('/');
  // Keep cardinality small: two segments at most, ids collapsed.
  return second && !/\d|^c[a-z0-9]{20,}$/.test(second) ? `${first}/${second}` : first;
};
const hourKey = (date = new Date()) => date.toISOString().slice(0, 13);

export function recordRequest(entry: { route: string; method: string; status: number; durationMs: number; code?: string }) {
  const key = `${hourKey()}|${entry.route.slice(0, 60)}`;
  const bucket = state.buckets.get(key) ?? { count: 0, errors: 0, clientErrors: 0, totalMs: 0, maxMs: 0 };
  bucket.count++;
  if (entry.status >= 500) bucket.errors++;
  else if (entry.status >= 400) bucket.clientErrors++;
  bucket.totalMs += Math.round(entry.durationMs);
  bucket.maxMs = Math.max(bucket.maxMs, Math.round(entry.durationMs));
  state.buckets.set(key, bucket);
  if (entry.status >= 500 || entry.status === 429)
    state.failures.push({
      route: entry.route.slice(0, 60),
      method: entry.method,
      status: entry.status,
      code: (entry.code || '').slice(0, 40),
      durationMs: Math.round(entry.durationMs),
      createdAt: new Date(),
    });
  if (!state.timer) {
    state.timer = setTimeout(() => void flushMetrics(), 15000);
    state.timer.unref?.();
  }
}

export async function flushMetrics() {
  if (state.timer) clearTimeout(state.timer);
  state.timer = undefined;
  const buckets = [...state.buckets.entries()];
  const failures = state.failures.splice(0, state.failures.length);
  state.buckets.clear();
  try {
    for (const [key, b] of buckets) {
      const [hour, route] = key.split('|');
      const existing = await db.apiMetric.findUnique({ where: { hour_route: { hour, route } } });
      await db.apiMetric.upsert({
        where: { hour_route: { hour, route } },
        create: { hour, route, ...b },
        update: {
          count: { increment: b.count },
          errors: { increment: b.errors },
          clientErrors: { increment: b.clientErrors },
          totalMs: { increment: b.totalMs },
          maxMs: Math.max(existing?.maxMs ?? 0, b.maxMs),
        },
      });
    }
    if (failures.length) await db.requestError.createMany({ data: failures });
  } catch {
    // Metrics are best-effort; losing one window must not affect requests.
  }
}
