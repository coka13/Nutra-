import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/auth';
import { activeGrantWhere, userEntitlements } from '@/lib/access';
import { deleteAccountData, passwordEmailConfigured, sendPasswordReset } from '@/lib/account-ops';
import { isMinor } from '@/lib/plans';
import { can } from '../rbac';
import { id, maskEmail, pagination, text, toCsv, type Endpoint } from './types';

const DAY = 86400000;
const appUser = { role: { not: 'ADMIN' } } satisfies Prisma.UserWhereInput;

function userFilter(query: URLSearchParams): Prisma.UserWhereInput {
  const q = (query.get('q') || '').trim().slice(0, 100);
  const role = query.get('role'),
    status = query.get('status'),
    plan = query.get('plan'),
    coaching = query.get('coaching');
  const where: Prisma.UserWhereInput[] = [appUser];
  if (q) where.push({ OR: [{ email: { contains: q.toLowerCase() } }, { name: { contains: q } }, { id: q }] });
  if (role === 'COACH' || role === 'INDEPENDENT') where.push({ role });
  if (status === 'ACTIVE' || status === 'SUSPENDED') where.push({ status });
  if (plan === 'FREE') where.push({ OR: [{ subscription: null }, { subscription: { OR: [{ status: { not: 'ACTIVE' } }, { tier: 'FREE' }] } }] });
  if (plan === 'PREMIUM' || plan === 'COACH') where.push({ subscription: { status: 'ACTIVE', tier: plan } });
  if (plan === 'GRANT') where.push({ grants: { some: activeGrantWhere() } });
  if (coaching === 'coached') where.push({ clientLinks: { some: { status: 'ACTIVE' } } });
  if (coaching === 'independent') where.push({ role: 'INDEPENDENT', clientLinks: { none: { status: 'ACTIVE' } } });
  return { AND: where };
}

const orderBy = (sort: string | null): Prisma.UserOrderByWithRelationInput =>
  sort === 'name' ? { name: 'asc' } : sort === 'lastActive' ? { lastActiveAt: { sort: 'desc', nulls: 'last' } } : sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

const listSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  coachStatus: true,
  createdAt: true,
  lastActiveAt: true,
  subscription: { select: { tier: true, status: true, cancelAtPeriodEnd: true } },
  profile: { select: { birthYear: true } },
  _count: { select: { clientLinks: { where: { status: 'ACTIVE' } }, coachLinks: { where: { status: 'ACTIVE' } } } },
} satisfies Prisma.UserSelect;

type ListRow = Prisma.UserGetPayload<{ select: typeof listSelect }>;
const listRow = (u: ListRow) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  coachStatus: u.role === 'COACH' ? u.coachStatus : null,
  createdAt: u.createdAt,
  lastActiveAt: u.lastActiveAt,
  plan: u.subscription?.status === 'ACTIVE' ? u.subscription.tier : 'FREE',
  cancelPending: !!u.subscription?.cancelAtPeriodEnd,
  minor: isMinor(u.profile?.birthYear),
  coached: u._count.clientLinks > 0,
  clients: u._count.coachLinks,
});

async function findUser(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, include: { subscription: true, profile: true } });
  if (!user || user.role === 'ADMIN') throw new ApiError('notFound', 404);
  return user;
}

export const userEndpoints: Endpoint[] = [
  {
    method: 'GET',
    pattern: 'users',
    permission: 'users.view',
    async handler({ query }) {
      const { skip, take, page, pageSize } = pagination(query);
      const where = userFilter(query);
      const [items, total] = await Promise.all([
        db.user.findMany({ where, select: listSelect, orderBy: orderBy(query.get('sort')), skip, take }),
        db.user.count({ where }),
      ]);
      return { items: items.map(listRow), total, page, pageSize };
    },
  },
  {
    method: 'GET',
    pattern: 'users/export',
    permission: 'users.export',
    stepUp: true,
    auditRead: true,
    async handler({ query }) {
      const rows = await db.user.findMany({ where: userFilter(query), select: listSelect, orderBy: { createdAt: 'asc' }, take: 50000 });
      // Minimum necessary data; minors' contact details are masked.
      const data = rows.map(listRow).map((r) => ({ ...r, email: r.minor ? maskEmail(r.email) : r.email }));
      return {
        __csv: toCsv(data, ['id', 'name', 'email', 'role', 'status', 'coachStatus', 'plan', 'coached', 'clients', 'minor', 'createdAt', 'lastActiveAt']),
        filename: `fitura-users-${new Date().toISOString().slice(0, 10)}.csv`,
      };
    },
  },
  {
    method: 'GET',
    pattern: 'users/:id',
    permission: 'users.view',
    auditRead: true,
    async handler({ params, admin }) {
      const user = await findUser(params.id);
      const since = new Date(Date.now() - 30 * DAY);
      const sinceDay = since.toISOString().slice(0, 10);
      const [grants, coaches, clients, activityDays, workouts, meals, events, tickets, reports, payments, sessions, access] = await Promise.all([
        db.entitlementGrant.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
        db.coachRelationship.findMany({ where: { clientId: user.id }, select: { id: true, status: true, createdAt: true, coach: { select: { id: true, name: true, email: true } } } }),
        db.coachRelationship.findMany({ where: { coachId: user.id }, select: { id: true, status: true, createdAt: true, client: { select: { id: true, name: true } } }, take: 200 }),
        db.userActivityDay.count({ where: { userId: user.id, date: { gte: sinceDay } } }),
        db.workoutSession.count({ where: { userId: user.id, startedAt: { gte: since } } }),
        db.mealEntry.count({ where: { userId: user.id, date: { gte: sinceDay } } }),
        db.auditLog.findMany({ where: { actorId: user.id }, orderBy: { createdAt: 'desc' }, take: 40, select: { action: true, createdAt: true } }),
        db.supportTicket.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, subject: true, status: true, category: true, createdAt: true } }),
        db.supportTicket.findMany({ where: { reportedUserId: user.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, subject: true, status: true, category: true, createdAt: true } }),
        can(admin.role, 'billing.view')
          ? db.payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, amount: true, currency: true, status: true, createdAt: true } })
          : Promise.resolve(null),
        db.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
        userEntitlements(user),
      ]);
      const minor = isMinor(user.profile?.birthYear);
      return {
        user: {
          id: user.id,
          name: user.name,
          // Contact details of minors are masked for every administrator.
          email: minor ? maskEmail(user.email) : user.email,
          phone: minor || !user.phone ? null : user.phone,
          role: user.role,
          status: user.status,
          suspendedAt: user.suspendedAt,
          coachStatus: user.coachStatus,
          coachVerifiedAt: user.coachVerifiedAt,
          coachCredentials: user.coachCredentials,
          coachClientLimit: user.coachClientLimit,
          language: user.language,
          createdAt: user.createdAt,
          lastActiveAt: user.lastActiveAt,
          minor,
          // Health and fitness details (goals, limitations, body data) are deliberately omitted.
          onboarded: !!user.profile?.onboarded,
          aiConsent: !!user.profile?.aiConsent,
        },
        subscription: user.subscription && {
          tier: user.subscription.tier,
          status: user.subscription.status,
          currentPeriodEnd: user.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
          canceledAt: user.subscription.canceledAt,
          provider: user.subscription.providerId ? 'stripe' : null,
        },
        entitlements: access,
        grants,
        coaches: coaches.map((c) => ({ id: c.id, status: c.status, since: c.createdAt, coach: c.coach })),
        clients: clients.map((c) => ({ id: c.id, status: c.status, since: c.createdAt, client: c.client })),
        activity: { activeDays30: activityDays, workouts30: workouts, mealEntries30: meals, activeSessions: sessions },
        events,
        tickets,
        reports,
        payments,
        emailConfigured: passwordEmailConfigured(),
      };
    },
  },
  {
    method: 'POST',
    pattern: 'users/:id/status',
    permission: 'users.manage',
    async handler({ params, body }) {
      const input = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: text(300).default('') }).parse(body);
      const user = await findUser(params.id);
      await db.$transaction([
        db.user.update({
          where: { id: user.id },
          data: { status: input.status, suspendedAt: input.status === 'SUSPENDED' ? new Date() : null },
        }),
        ...(input.status === 'SUSPENDED' ? [db.session.deleteMany({ where: { userId: user.id } })] : []),
      ]);
      return { ok: true, status: input.status, reason: input.reason };
    },
  },
  {
    method: 'POST',
    pattern: 'users/:id/role',
    permission: 'users.manage',
    async handler({ params, body }) {
      // Administrative roles are never granted here; console access uses separate accounts.
      const { role } = z.object({ role: z.enum(['INDEPENDENT', 'COACH']) }).parse(body);
      const user = await findUser(params.id);
      if (user.role === role) return { ok: true, role };
      await db.$transaction(async (tx) => {
        if (user.role === 'COACH')
          await tx.coachRelationship.updateMany({ where: { coachId: user.id, status: { in: ['ACTIVE', 'PENDING'] } }, data: { status: 'REVOKED' } });
        if (role === 'COACH')
          await tx.coachRelationship.updateMany({ where: { clientId: user.id, status: { in: ['ACTIVE', 'PENDING'] } }, data: { status: 'REVOKED' } });
        await tx.user.update({ where: { id: user.id }, data: { role, ...(role === 'COACH' && { coachStatus: 'APPROVED' }) } });
      });
      return { ok: true, role, previous: user.role };
    },
  },
  {
    method: 'POST',
    pattern: 'users/:id/reset-password',
    permission: 'users.manage',
    async handler({ params }) {
      const user = await findUser(params.id);
      if (user.status === 'SUSPENDED') throw new ApiError('accountSuspended', 409);
      await sendPasswordReset(user);
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: 'users/:id/sessions/revoke',
    permission: 'users.manage',
    async handler({ params }) {
      const user = await findUser(params.id);
      const { count } = await db.session.deleteMany({ where: { userId: user.id } });
      return { ok: true, revoked: count };
    },
  },
  {
    method: 'POST',
    pattern: 'users/:id/delete',
    permission: 'users.delete',
    stepUp: true,
    async handler({ params, body }) {
      const { confirmEmail } = z.object({ confirmEmail: z.string().max(200) }).parse(body);
      const user = await findUser(params.id);
      if (confirmEmail.trim().toLowerCase() !== user.email) throw new ApiError('confirmationMismatch', 400);
      if (user.email === 'alex@nutri.local') throw new ApiError('demoProtected', 403);
      // Paid subscriptions must be cancelled with the payment provider first.
      if (user.subscription?.providerId && user.subscription.status === 'ACTIVE') throw new ApiError('subscriptionActive', 409);
      await db.$transaction((tx) => deleteAccountData(tx, user));
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: 'users/:id/grants',
    permission: 'entitlements.manage',
    async handler({ params, body, admin }) {
      const input = z
        .object({
          kind: z.enum(['PREMIUM', 'AD_FREE', 'COACH', 'AI']),
          days: z.number().int().min(1).max(3650).nullable(),
          reason: text(300).min(3),
        })
        .parse(body);
      const user = await findUser(params.id);
      if (input.kind === 'COACH' && user.role !== 'COACH') throw new ApiError('coachOnly', 400);
      const grant = await db.entitlementGrant.create({
        data: {
          userId: user.id,
          kind: input.kind,
          reason: input.reason,
          endsAt: input.days ? new Date(Date.now() + input.days * DAY) : null,
          createdBy: admin.id,
        },
      });
      return { grant };
    },
  },
  {
    method: 'POST',
    pattern: 'users/:id/grants/:grantId/revoke',
    permission: 'entitlements.manage',
    async handler({ params }) {
      const { count } = await db.entitlementGrant.updateMany({
        where: { id: params.grantId, userId: params.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!count) throw new ApiError('notFound', 404);
      return { ok: true };
    },
  },
];

const coachFilter = (query: URLSearchParams): Prisma.UserWhereInput => {
  const q = (query.get('q') || '').trim().slice(0, 100);
  const status = query.get('status');
  return {
    role: 'COACH',
    ...(q && { OR: [{ email: { contains: q.toLowerCase() } }, { name: { contains: q } }] }),
    ...(status && ['APPROVED', 'PENDING', 'REJECTED', 'REVOKED'].includes(status) && { coachStatus: status }),
    ...(query.get('verified') === 'yes' && { coachVerifiedAt: { not: null } }),
    ...(query.get('verified') === 'no' && { coachVerifiedAt: null }),
  };
};

export const coachEndpoints: Endpoint[] = [
  {
    method: 'GET',
    pattern: 'coaches',
    permission: 'coaches.view',
    async handler({ query }) {
      const { skip, take, page, pageSize } = pagination(query);
      const where = coachFilter(query);
      const [items, total, counts] = await Promise.all([
        db.user.findMany({
          where,
          orderBy: query.get('sort') === 'clients' ? { coachLinks: { _count: 'desc' } } : { createdAt: 'desc' },
          skip,
          take,
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            coachStatus: true,
            coachVerifiedAt: true,
            coachClientLimit: true,
            createdAt: true,
            lastActiveAt: true,
            subscription: { select: { tier: true, status: true } },
            _count: { select: { coachLinks: { where: { status: 'ACTIVE' } }, programs: true } },
          },
        }),
        db.user.count({ where }),
        db.user.groupBy({ by: ['coachStatus'], where: { role: 'COACH' }, _count: true }),
      ]);
      const ids = items.map((c) => c.id);
      const [pending, complaints] = await Promise.all([
        db.coachRelationship.groupBy({ by: ['coachId'], where: { coachId: { in: ids }, status: 'PENDING' }, _count: true }),
        db.supportTicket.groupBy({ by: ['reportedUserId'], where: { reportedUserId: { in: ids }, status: { notIn: ['RESOLVED', 'CLOSED'] } }, _count: true }),
      ]);
      const pendingMap = new Map(pending.map((p) => [p.coachId, p._count]));
      const complaintMap = new Map(complaints.map((c) => [c.reportedUserId, c._count]));
      return {
        items: items.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          status: c.status,
          coachStatus: c.coachStatus,
          verified: !!c.coachVerifiedAt,
          clientLimit: c.coachClientLimit,
          plan: c.subscription?.status === 'ACTIVE' ? c.subscription.tier : 'FREE',
          activeClients: c._count.coachLinks,
          pendingClients: pendingMap.get(c.id) ?? 0,
          programs: c._count.programs,
          openComplaints: complaintMap.get(c.id) ?? 0,
          createdAt: c.createdAt,
          lastActiveAt: c.lastActiveAt,
        })),
        total,
        page,
        pageSize,
        statusCounts: Object.fromEntries(counts.map((c) => [c.coachStatus, c._count])),
      };
    },
  },
  {
    method: 'POST',
    pattern: 'coaches/:id/status',
    permission: 'coaches.manage',
    async handler({ params, body }) {
      const input = z.object({ status: z.enum(['APPROVED', 'PENDING', 'REJECTED', 'REVOKED']), note: text(300).default('') }).parse(body);
      const coach = await db.user.findUnique({ where: { id: params.id } });
      if (!coach || coach.role !== 'COACH') throw new ApiError('notFound', 404);
      await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: coach.id }, data: { coachStatus: input.status } });
        // Revoked or rejected coaches immediately lose access to client data.
        if (input.status === 'REVOKED' || input.status === 'REJECTED')
          await tx.coachRelationship.updateMany({ where: { coachId: coach.id, status: { in: ['ACTIVE', 'PENDING'] } }, data: { status: 'REVOKED' } });
        await tx.notification.create({ data: { userId: coach.id, key: `coachStatus${input.status[0]}${input.status.slice(1).toLowerCase()}` } });
      });
      return { ok: true, status: input.status, previous: coach.coachStatus, note: input.note };
    },
  },
  {
    method: 'POST',
    pattern: 'coaches/:id/verify',
    permission: 'coaches.manage',
    async handler({ params, body }) {
      const input = z.object({ verified: z.boolean(), credentials: text(1000).default('') }).parse(body);
      const coach = await db.user.findUnique({ where: { id: params.id } });
      if (!coach || coach.role !== 'COACH') throw new ApiError('notFound', 404);
      await db.user.update({
        where: { id: coach.id },
        data: { coachVerifiedAt: input.verified ? coach.coachVerifiedAt ?? new Date() : null, coachCredentials: input.credentials },
      });
      return { ok: true, verified: input.verified };
    },
  },
  {
    method: 'POST',
    pattern: 'coaches/:id/limit',
    permission: 'coaches.manage',
    async handler({ params, body }) {
      const { limit } = z.object({ limit: z.number().int().min(0).max(1000).nullable() }).parse(body);
      const coach = await db.user.findUnique({ where: { id: params.id } });
      if (!coach || coach.role !== 'COACH') throw new ApiError('notFound', 404);
      await db.user.update({ where: { id: coach.id }, data: { coachClientLimit: limit } });
      return { ok: true, limit, previous: coach.coachClientLimit };
    },
  },
];

