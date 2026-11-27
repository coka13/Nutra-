import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ApiError, notify } from '@/lib/auth';
import { tokenHash } from '@/lib/security';
import { billingConfigured } from '@/lib/billing';
import { passwordEmailConfigured } from '@/lib/account-ops';
import { configSchema, getConfigVersion, parseStoredConfig, publishConfig, rollbackConfig } from '@/lib/remote-config';
import { JOBS, backupDirectory, runJob, type JobName } from '@/lib/jobs';
import { flushMetrics } from '@/lib/metrics';
import { dashboard, storageUsage } from '../stats';
import { ADMIN_ROLES, can } from '../rbac';
import { adminHostAllowed } from '../auth';
import { dateRange, pagination, text, toCsv, type Endpoint } from './types';
import packageJson from '../../../../package.json';
import { realUserWhere } from '@/lib/demo';

const INVITE_MS = 72 * 3600 * 1000;
const inviteUrl = (token: string) => {
  const host = process.env.ADMIN_HOST;
  const base = host ? `https://${host}` : (process.env.APP_URL || '').replace(/\/$/, '');
  return `${base}/admin/setup?token=${token}`;
};
function newInvite() {
  const token = randomBytes(32).toString('hex');
  return { token, data: { inviteTokenHash: tokenHash(token), inviteExpiresAt: new Date(Date.now() + INVITE_MS) } };
}

export const dashboardEndpoints: Endpoint[] = [
  {
    method: 'GET',
    pattern: 'dashboard',
    permission: 'dashboard.view',
    async handler({ query, admin }) {
      const { from, to } = dateRange(query);
      const data = await dashboard(from, to);
      // Finance figures only for roles that may see billing.
      if (!can(admin.role, 'billing.view'))
        return { ...data, revenue: null, current: { ...data.current, revenueCents: null }, series: data.series.map((s) => ({ ...s, revenue: null })) };
      return data;
    },
  },
  {
    method: 'GET',
    pattern: 'search',
    async handler({ query, admin }) {
      const q = (query.get('q') || '').trim().slice(0, 80);
      if (q.length < 2) return { results: [] };
      const results: { type: string; id: string; title: string; subtitle: string }[] = [];
      if (can(admin.role, 'users.view')) {
        const users = await db.user.findMany({
          where: { role: { not: 'ADMIN' }, ...realUserWhere, OR: [{ email: { contains: q.toLowerCase() } }, { name: { contains: q } }, { id: q }] },
          take: 6,
          select: { id: true, name: true, email: true, role: true },
        });
        results.push(...users.map((u) => ({ type: u.role === 'COACH' ? 'coach' : 'user', id: u.id, title: u.name, subtitle: u.email })));
      }
      if (can(admin.role, 'support.view')) {
        const tickets = await db.supportTicket.findMany({ where: { OR: [{ subject: { contains: q } }, { id: q }] }, take: 5, select: { id: true, subject: true, status: true } });
        results.push(...tickets.map((t) => ({ type: 'ticket', id: t.id, title: t.subject, subtitle: t.status })));
      }
      if (can(admin.role, 'content.view')) {
        const items = await db.contentItem.findMany({ where: { OR: [{ titleEn: { contains: q } }, { titleHe: { contains: q } }] }, take: 5, select: { id: true, titleEn: true, type: true } });
        results.push(...items.map((i) => ({ type: 'content', id: i.id, title: i.titleEn, subtitle: i.type })));
      }
      return { results };
    },
  },
];

export const configEndpoints: Endpoint[] = [
  {
    method: 'GET',
    pattern: 'config',
    permission: 'config.view',
    async handler() {
      const [{ version, config }, history, flags] = await Promise.all([
        getConfigVersion(),
        db.configVersion.findMany({ orderBy: { version: 'desc' }, take: 30, select: { version: true, note: true, createdBy: true, createdAt: true } }),
        db.featureFlag.findMany(),
      ]);
      const admins = await db.adminAccount.findMany({ where: { id: { in: history.map((h) => h.createdBy) } }, select: { id: true, email: true } });
      const emails = new Map(admins.map((a) => [a.id, a.email]));
      return { version, config, history: history.map((h) => ({ ...h, createdBy: emails.get(h.createdBy) ?? h.createdBy })), flags };
    },
  },
  {
    method: 'GET',
    pattern: 'config/versions/:version',
    permission: 'config.view',
    async handler({ params }) {
      const row = await db.configVersion.findUnique({ where: { version: Number(params.version) || 0 } });
      if (!row) throw new ApiError('notFound', 404);
      return { version: row.version, config: parseStoredConfig(row.data) };
    },
  },
  {
    method: 'POST',
    pattern: 'config',
    permission: 'config.manage',
    stepUp: true,
    async handler({ body, admin }) {
      // Technical administrators manage app behaviour; plans, AI and ads have their own owners.
      const input = z
        .object({
          features: configSchema.shape.features,
          maintenance: configSchema.shape.maintenance,
          app: configSchema.shape.app,
          note: text(200).min(3),
          baseVersion: z.number().int(),
        })
        .parse(body);
      const { version, config } = await getConfigVersion();
      if (input.baseVersion !== version) throw new ApiError('configChanged', 409);
      const published = await publishConfig({ ...config, features: input.features, maintenance: input.maintenance, app: input.app }, admin.id, input.note);
      return { version: published.version, maintenance: input.maintenance.enabled };
    },
  },
  {
    method: 'POST',
    pattern: 'config/rollback',
    permission: 'config.manage',
    stepUp: true,
    async handler({ body, admin }) {
      const { version } = z.object({ version: z.number().int().min(1) }).parse(body);
      const result = await rollbackConfig(version, admin.id);
      if (!result) throw new ApiError('notFound', 404);
      return { version: result.version, restored: version };
    },
  },
  {
    method: 'POST',
    pattern: 'config/flags',
    permission: 'config.manage',
    async handler({ body }) {
      const data = z.object({ key: z.enum(['marketplace']), enabled: z.boolean() }).parse(body);
      await db.featureFlag.upsert({ where: { key: data.key }, create: data, update: { enabled: data.enabled } });
      return { ok: true };
    },
  },
];

const ticketWhere = (query: URLSearchParams, adminId: string): Prisma.SupportTicketWhereInput => {
  const q = (query.get('q') || '').trim().slice(0, 100);
  const pick = (key: string, allowed: string[]) => {
    const v = query.get(key);
    return v && allowed.includes(v) ? v : undefined;
  };
  const assignee = query.get('assignee');
  return {
    ...(q && { OR: [{ subject: { contains: q } }, { email: { contains: q.toLowerCase() } }, { id: q }] }),
    status: pick('status', ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED']) ?? (query.get('status') === 'active' ? { in: ['OPEN', 'IN_PROGRESS', 'WAITING'] } : undefined),
    priority: pick('priority', ['LOW', 'NORMAL', 'HIGH', 'URGENT']),
    category: pick('category', ['SUPPORT', 'BUG', 'FEATURE', 'COMPLAINT', 'REPORT']),
    ...(assignee === 'me' && { assigneeId: adminId }),
    ...(assignee === 'none' && { assigneeId: null }),
  };
};

export const supportEndpoints: Endpoint[] = [
  {
    method: 'GET',
    pattern: 'tickets',
    permission: 'support.view',
    async handler({ query, admin }) {
      const { skip, take, page, pageSize } = pagination(query);
      const where = ticketWhere(query, admin.id);
      const [items, total, counts, assignees] = await Promise.all([
        db.supportTicket.findMany({ where, skip, take, orderBy: [{ updatedAt: 'desc' }], include: { _count: { select: { messages: true } } } }),
        db.supportTicket.count({ where }),
        db.supportTicket.groupBy({ by: ['status'], _count: true }),
        db.adminAccount.findMany({ where: { status: 'ACTIVE', role: { in: ['SUPER_ADMIN', 'SUPPORT_ADMIN'] } }, select: { id: true, name: true } }),
      ]);
      return { items, total, page, pageSize, statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count])), assignees };
    },
  },
  {
    method: 'GET',
    pattern: 'tickets/:id',
    permission: 'support.view',
    auditRead: true,
    async handler({ params }) {
      const ticket = await db.supportTicket.findUnique({ where: { id: params.id }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
      if (!ticket) throw new ApiError('notFound', 404);
      const [user, reported, authors] = await Promise.all([
        ticket.userId ? db.user.findUnique({ where: { id: ticket.userId }, select: { id: true, name: true, role: true, status: true } }) : null,
        ticket.reportedUserId ? db.user.findUnique({ where: { id: ticket.reportedUserId }, select: { id: true, name: true, role: true, status: true, coachStatus: true } }) : null,
        db.adminAccount.findMany({ where: { id: { in: ticket.messages.map((m) => m.adminId!).filter(Boolean) } }, select: { id: true, name: true } }),
      ]);
      const names = new Map(authors.map((a) => [a.id, a.name]));
      return { ticket: { ...ticket, messages: ticket.messages.map((m) => ({ ...m, adminName: m.adminId ? names.get(m.adminId) ?? '' : '' })) }, user, reported };
    },
  },
  {
    method: 'POST',
    pattern: 'tickets/:id',
    permission: 'support.manage',
    async handler({ params, body }) {
      const input = z
        .object({
          status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED']).optional(),
          priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
          assigneeId: z.string().max(100).nullable().optional(),
        })
        .parse(body);
      if (input.assigneeId) {
        const assignee = await db.adminAccount.findUnique({ where: { id: input.assigneeId } });
        if (!assignee || assignee.status !== 'ACTIVE' || !can(assignee.role, 'support.manage')) throw new ApiError('invalidAssignee', 400);
      }
      const ticket = await db.supportTicket.update({ where: { id: params.id }, data: { ...input, updatedAt: new Date() } });
      return { ticket };
    },
  },
  {
    method: 'POST',
    pattern: 'tickets/:id/reply',
    permission: 'support.manage',
    async handler({ params, body, admin }) {
      const input = z.object({ body: text(5000).min(1), internal: z.boolean().default(false) }).parse(body);
      const ticket = await db.supportTicket.findUnique({ where: { id: params.id } });
      if (!ticket) throw new ApiError('notFound', 404);
      const message = await db.ticketMessage.create({ data: { ticketId: ticket.id, authorType: 'ADMIN', adminId: admin.id, body: input.body, internal: input.internal } });
      await db.supportTicket.update({
        where: { id: ticket.id },
        data: { updatedAt: new Date(), ...(!input.internal && ticket.status === 'OPEN' && { status: 'WAITING' }) },
      });
      if (!input.internal && ticket.userId) await notify(ticket.userId, 'supportReply');
      return { message: { ...message, body: undefined }, internal: input.internal };
    },
  },
];

export const systemEndpoints: Endpoint[] = [
  {
    method: 'GET',
    pattern: 'system',
    permission: 'system.view',
    async handler() {
      await flushMetrics();
      const started = performance.now();
      const dbOk = await db.$queryRawUnsafe('SELECT 1').then(() => true).catch(() => false);
      const dbLatencyMs = Math.round(performance.now() - started);
      const dayAgo = new Date(Date.now() - 86400000).toISOString().slice(0, 13);
      const [metrics, failures, jobs, providers, storage, { config }, backups] = await Promise.all([
        db.apiMetric.groupBy({ by: ['route'], where: { hour: { gte: dayAgo } }, _sum: { count: true, errors: true, clientErrors: true, totalMs: true }, _max: { maxMs: true } }),
        db.requestError.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
        Promise.all(JOBS.map((job) => db.jobRun.findFirst({ where: { job }, orderBy: { startedAt: 'desc' } }).then((last) => ({ job, last })))),
        db.aIProvider.findMany({ select: { id: true, name: true, enabled: true, lastStatus: true, lastCheckedAt: true } }),
        storageUsage(),
        getConfigVersion(),
        (async () => {
          const dir = backupDirectory();
          if (!dir) return { directory: null, files: [] as { name: string; bytes: number; createdAt: Date }[] };
          const names = await fs.readdir(dir).catch(() => [] as string[]);
          const files = await Promise.all(
            names.filter((n) => /^nutra-.*\.db$/.test(n)).map(async (name) => {
              const stat = await fs.stat(path.join(dir, name));
              return { name, bytes: stat.size, createdAt: stat.mtime };
            }),
          );
          return { directory: path.basename(dir), files: files.sort((a, b) => +b.createdAt - +a.createdAt).slice(0, 20) };
        })(),
      ]);
      const hourly = await db.apiMetric.findMany({ where: { hour: { gte: dayAgo } }, orderBy: { hour: 'asc' } });
      const byHour = new Map<string, { hour: string; requests: number; errors: number; avgMs: number; totalMs: number }>();
      for (const m of hourly) {
        const h = byHour.get(m.hour) ?? { hour: m.hour, requests: 0, errors: 0, avgMs: 0, totalMs: 0 };
        h.requests += m.count;
        h.errors += m.errors;
        h.totalMs += m.totalMs;
        byHour.set(m.hour, h);
      }
      const total = metrics.reduce((s, m) => s + (m._sum.count ?? 0), 0),
        errors = metrics.reduce((s, m) => s + (m._sum.errors ?? 0), 0);
      return {
        health: {
          status: dbOk ? (total && errors / total > 0.05 ? 'degraded' : 'ok') : 'down',
          database: { ok: dbOk, latencyMs: dbLatencyMs, provider: 'sqlite' },
          uptimeSeconds: Math.round(process.uptime()),
          memoryMb: Math.round(process.memoryUsage().rss / 1048576),
          load: os.loadavg()[0],
        },
        versions: {
          app: packageJson.version,
          commit: (process.env.GIT_SHA || '').slice(0, 12) || null,
          node: process.version,
          next: (packageJson.dependencies as Record<string, string>).next,
          mobileMinimum: config.app.minimumVersion,
          mobileLatest: config.app.latestVersion,
          updateMode: config.app.updateMode,
          environment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
        },
        traffic: {
          requests24h: total,
          errorRate24h: total ? Math.round((errors / total) * 10000) / 100 : 0,
          routes: metrics
            .map((m) => ({
              route: m.route,
              requests: m._sum.count ?? 0,
              errors: m._sum.errors ?? 0,
              clientErrors: m._sum.clientErrors ?? 0,
              avgMs: m._sum.count ? Math.round((m._sum.totalMs ?? 0) / m._sum.count) : 0,
              maxMs: m._max.maxMs ?? 0,
            }))
            .sort((a, b) => b.requests - a.requests),
          hourly: [...byHour.values()].map((h) => ({ hour: h.hour.slice(11) + ':00', requests: h.requests, errors: h.errors, avgMs: h.requests ? Math.round(h.totalMs / h.requests) : 0 })),
        },
        failures,
        jobs,
        backups,
        storage,
        aiProviders: providers,
        // Presence checks only; values are never returned.
        configuration: {
          adminHost: !!process.env.ADMIN_HOST,
          adminHostActive: adminHostAllowed(process.env.ADMIN_HOST || null),
          encryptionKey: !!process.env.ADMIN_ENCRYPTION_KEY,
          cronSecret: !!process.env.CRON_SECRET,
          billing: billingConfigured(),
          email: passwordEmailConfigured(),
          ai: !!process.env.OPENAI_API_KEY || providers.some((p) => p.enabled),
          push: true,
          https: (process.env.APP_URL || '').startsWith('https://'),
        },
      };
    },
  },
  {
    method: 'POST',
    pattern: 'system/jobs/:job',
    permission: 'system.manage',
    async handler({ params, session }) {
      const job = z.enum(JOBS).parse(params.job) as JobName;
      // Backups copy every record, so they also need a fresh second factor.
      if (job === 'backup' && (!session.reauthAt || Date.now() - +session.reauthAt > 10 * 60 * 1000)) throw new ApiError('stepUpRequired', 403);
      return runJob(job);
    },
  },
];

const adminPublic = { id: true, email: true, name: true, role: true, status: true, lastLoginAt: true, createdAt: true, totpEnabledAt: true, lockedUntil: true, inviteExpiresAt: true } satisfies Prisma.AdminAccountSelect;

async function guardLastSuperAdmin(targetId: string) {
  const supers = await db.adminAccount.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: targetId } } });
  if (!supers) throw new ApiError('lastSuperAdmin', 409);
}

export const adminEndpoints: Endpoint[] = [
  {
    method: 'GET',
    pattern: 'admins',
    permission: 'admins.manage',
    async handler() {
      const [admins, sessions] = await Promise.all([
        db.adminAccount.findMany({ select: adminPublic, orderBy: { createdAt: 'asc' } }),
        db.adminSession.groupBy({ by: ['adminId'], where: { expiresAt: { gt: new Date() } }, _count: true }),
      ]);
      const map = new Map(sessions.map((s) => [s.adminId, s._count]));
      return { admins: admins.map((a) => ({ ...a, mfa: !!a.totpEnabledAt, totpEnabledAt: undefined, sessions: map.get(a.id) ?? 0 })) };
    },
  },
  {
    method: 'POST',
    pattern: 'admins',
    permission: 'admins.manage',
    stepUp: true,
    async handler({ body, admin }) {
      const input = z.object({ email: z.email().max(200), name: text(100).min(2), role: z.enum(ADMIN_ROLES) }).parse(body);
      const email = input.email.toLowerCase();
      if (await db.adminAccount.findUnique({ where: { email } })) throw new ApiError('emailTaken', 409);
      const invite = newInvite();
      const created = await db.adminAccount.create({ data: { email, name: input.name, role: input.role, status: 'INVITED', createdBy: admin.id, ...invite.data }, select: adminPublic });
      // The link is shown once; only its hash is stored.
      return { admin: created, inviteUrl: inviteUrl(invite.token), expiresAt: invite.data.inviteExpiresAt };
    },
  },
  {
    method: 'POST',
    pattern: 'admins/:id',
    permission: 'admins.manage',
    stepUp: true,
    async handler({ params, body, admin }) {
      const input = z.object({ role: z.enum(ADMIN_ROLES).optional(), status: z.enum(['ACTIVE', 'DISABLED']).optional() }).parse(body);
      if (params.id === admin.id) throw new ApiError('cannotChangeSelf', 409);
      const target = await db.adminAccount.findUnique({ where: { id: params.id } });
      if (!target) throw new ApiError('notFound', 404);
      if (target.role === 'SUPER_ADMIN' && ((input.role && input.role !== 'SUPER_ADMIN') || input.status === 'DISABLED')) await guardLastSuperAdmin(target.id);
      if (input.status === 'ACTIVE' && target.status === 'INVITED') throw new ApiError('inviteNotAccepted', 409);
      const updated = await db.$transaction(async (tx) => {
        const row = await tx.adminAccount.update({ where: { id: target.id }, data: input, select: adminPublic });
        // Role or status changes end existing sessions so new permissions apply at once.
        await tx.adminSession.deleteMany({ where: { adminId: target.id } });
        return row;
      });
      return { admin: updated, previous: { role: target.role, status: target.status } };
    },
  },
  {
    method: 'POST',
    pattern: 'admins/:id/reset',
    permission: 'admins.manage',
    stepUp: true,
    async handler({ params, admin }) {
      if (params.id === admin.id) throw new ApiError('cannotChangeSelf', 409);
      const target = await db.adminAccount.findUnique({ where: { id: params.id } });
      if (!target) throw new ApiError('notFound', 404);
      if (target.role === 'SUPER_ADMIN') await guardLastSuperAdmin(target.id);
      const invite = newInvite();
      await db.$transaction([
        db.adminAccount.update({
          where: { id: target.id },
          data: { status: 'INVITED', passwordHash: null, totpSecret: null, totpEnabledAt: null, lastTotpStep: null, recoveryCodes: '', failedAttempts: 0, lockedUntil: null, ...invite.data },
        }),
        db.adminSession.deleteMany({ where: { adminId: target.id } }),
      ]);
      return { inviteUrl: inviteUrl(invite.token), expiresAt: invite.data.inviteExpiresAt };
    },
  },
  {
    method: 'POST',
    pattern: 'admins/:id/sessions/revoke',
    permission: 'admins.manage',
    stepUp: true,
    async handler({ params }) {
      const { count } = await db.adminSession.deleteMany({ where: { adminId: params.id } });
      return { revoked: count };
    },
  },
];

const auditWhere = (query: URLSearchParams): Prisma.AdminAuditLogWhereInput => {
  const { from, to } = dateRange(query, 30);
  const result = query.get('result');
  return {
    createdAt: { gte: from, lte: to },
    ...(query.get('adminId') && { adminId: query.get('adminId')! }),
    ...(query.get('action') && { action: { contains: query.get('action')!.slice(0, 60) } }),
    ...(query.get('resourceType') && { resourceType: query.get('resourceType')!.slice(0, 60) }),
    ...(query.get('resourceId') && { resourceId: query.get('resourceId')!.slice(0, 120) }),
    ...(result && ['SUCCESS', 'FAILURE', 'DENIED'].includes(result) && { result }),
  };
};

export const auditEndpoints: Endpoint[] = [
  {
    method: 'GET',
    pattern: 'audit',
    permission: 'audit.view',
    async handler({ query }) {
      const { skip, take, page, pageSize } = pagination(query, 50);
      const where = auditWhere(query);
      const [items, total, admins] = await Promise.all([
        db.adminAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        db.adminAuditLog.count({ where }),
        db.adminAccount.findMany({ select: { id: true, email: true } }),
      ]);
      return { items, total, page, pageSize, admins };
    },
  },
  {
    method: 'GET',
    pattern: 'audit/export',
    permission: 'audit.view',
    stepUp: true,
    auditRead: true,
    async handler({ query }) {
      const rows = await db.adminAuditLog.findMany({ where: auditWhere(query), orderBy: { createdAt: 'asc' }, take: 50000 });
      return {
        __csv: toCsv(rows, ['createdAt', 'adminId', 'adminEmail', 'action', 'resourceType', 'resourceId', 'result', 'details']),
        filename: `fitura-admin-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      };
    },
  },
];
