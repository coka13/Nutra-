import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError } from '@/lib/auth';
import { adminHostAllowed, assertAdminMutation, requireAdmin } from '@/lib/admin/auth';
import { adminAudit } from '@/lib/admin/audit';
import { recordRequest } from '@/lib/metrics';
import type { Endpoint } from '@/lib/admin/api/types';
import { authEndpoints } from '@/lib/admin/api/auth-endpoints';
import { coachEndpoints, userEndpoints } from '@/lib/admin/api/users-endpoints';
import { adEndpoints, aiEndpoints, billingEndpoints } from '@/lib/admin/api/business-endpoints';
import { announcementEndpoints, contentEndpoints } from '@/lib/admin/api/content-endpoints';
import {
  adminEndpoints,
  auditEndpoints,
  configEndpoints,
  dashboardEndpoints,
  supportEndpoints,
  systemEndpoints,
} from '@/lib/admin/api/ops-endpoints';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const endpoints: Endpoint[] = [
  ...authEndpoints,
  ...dashboardEndpoints,
  ...userEndpoints,
  ...coachEndpoints,
  ...billingEndpoints,
  ...aiEndpoints,
  ...adEndpoints,
  ...contentEndpoints,
  ...announcementEndpoints,
  ...configEndpoints,
  ...supportEndpoints,
  ...systemEndpoints,
  ...adminEndpoints,
  ...auditEndpoints,
];

const headers = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

/** Static segments win over parameters, so `users/export` is matched before `users/:id`. */
function match(method: string, path: string) {
  const parts = path.split('/');
  let best: { endpoint: Endpoint; params: Record<string, string>; score: number } | null = null;
  for (const endpoint of endpoints) {
    if (endpoint.method !== method) continue;
    const pattern = endpoint.pattern.split('/');
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let score = 0,
      ok = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (pattern[i] === parts[i]) score++;
      else {
        ok = false;
        break;
      }
    }
    if (ok && (!best || score > best.score)) best = { endpoint, params, score };
  }
  return best;
}

function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return { code: 'invalid', status: 400, issues: error instanceof z.ZodError ? error.issues.slice(0, 5).map((i) => i.path.join('.')) : undefined };
  if (error instanceof ApiError) return { code: error.code, status: error.status };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return { code: 'conflict', status: 409 };
    if (error.code === 'P2025' || error.code === 'P2003') return { code: 'notFound', status: 404 };
  }
  console.error(JSON.stringify({ event: 'admin_api_error', type: error instanceof Error ? error.name : 'unknown' }));
  return { code: 'serverError', status: 500 };
}

const resourceOf = (pattern: string, params: Record<string, string>) => ({
  resourceType: pattern.split('/')[0],
  resourceId: params.id ?? params.userId ?? params.key ?? params.job ?? params.version ?? null,
});

async function handle(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const started = performance.now();
  const path = (await context.params).path.join('/');
  let status = 200,
    code = '';
  try {
    // Outside the admin host the console does not exist.
    if (!adminHostAllowed(req.headers.get('host'))) throw new ApiError('notFound', 404);
    const found = match(req.method, path);
    if (!found) throw new ApiError('notFound', 404);
    const { endpoint, params } = found;
    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      assertAdminMutation(req);
      if (Number(req.headers.get('content-length') || 0) > 2_000_000) throw new ApiError('invalid', 413);
      const raw = await req.text();
      body = raw ? z.record(z.string(), z.unknown()).parse(JSON.parse(raw)) : {};
    }
    const query = req.nextUrl.searchParams;
    let result;
    if (endpoint.public) result = await endpoint.handler({ req, body, query, params });
    else {
      const resource = resourceOf(endpoint.pattern, params);
      let ctx;
      try {
        ctx = await requireAdmin(req, endpoint.permission, { stepUp: endpoint.stepUp });
      } catch (error) {
        // Record refused attempts by signed-in administrators (privilege probing).
        if (error instanceof ApiError && error.status === 403) {
          const session = await requireAdmin(req).catch(() => null);
          if (session)
            await adminAudit({ admin: session.admin, action: `${req.method} ${endpoint.pattern}`, ...resource, details: { reason: error.code }, result: 'DENIED' });
        }
        throw error;
      }
      const auditable = req.method === 'POST' && !endpoint.pattern.startsWith('auth/') && !endpoint.pattern.endsWith('/preview');
      try {
        result = await endpoint.handler({ req, body, query, params, admin: ctx.admin, session: ctx.session });
        if (auditable || endpoint.auditRead)
          await adminAudit({
            admin: ctx.admin,
            action: `${req.method} ${endpoint.pattern}`,
            ...resource,
            details: req.method === 'POST' ? { input: body, ...(result && typeof result === 'object' && !('__csv' in result) ? { outcome: pickOutcome(result) } : {}) } : { query: Object.fromEntries(query) },
            result: 'SUCCESS',
          });
      } catch (error) {
        if (auditable) await adminAudit({ admin: ctx.admin, action: `${req.method} ${endpoint.pattern}`, ...resource, details: { input: body, error: failure(error).code }, result: 'FAILURE' });
        throw error;
      }
    }
    if (result && typeof result === 'object' && '__csv' in result) {
      const csv = result as { __csv: string; filename: string };
      return new NextResponse('﻿' + csv.__csv, {
        headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${csv.filename}"` },
      });
    }
    return NextResponse.json(result ?? { ok: true }, { headers });
  } catch (error) {
    const f = failure(error);
    status = f.status;
    code = f.code;
    return NextResponse.json({ error: f.code, ...(f.issues && { issues: f.issues }) }, { status: f.status, headers });
  } finally {
    recordRequest({ route: `console/${path.split('/')[0] || 'root'}`, method: req.method, status, durationMs: performance.now() - started, code });
  }
}

/** Small, non-sensitive facts about what an action changed, for the audit trail. */
function pickOutcome(result: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of ['status', 'previous', 'role', 'version', 'restored', 'revoked', 'imported', 'limit', 'verified', 'keyChanged', 'saved', 'maintenance'])
    if (key in result) out[key] = result[key];
  return out;
}

export const GET = handle;
export const POST = handle;
