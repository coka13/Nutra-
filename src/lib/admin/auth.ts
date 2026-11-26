import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { ApiError, rateLimit } from '@/lib/auth';
import { hashPassword, tokenHash, verifyPassword } from '@/lib/security';
import { acceptsOrigin } from '@/lib/request-origin';
import { consumeRecoveryCode, decryptSecret, verifyTotp } from './crypto';
import { can, isAdminRole, permissionsFor, STEP_UP_WINDOW_MS, type Permission } from './rbac';

export const ADMIN_IDLE_MS = 30 * 60 * 1000;
export const ADMIN_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
export const MIN_ADMIN_PASSWORD = 14;

/** `__Host-` binds the cookie to the exact admin host (HTTPS, no Domain, Path=/). */
export const adminCookieName = () =>
  process.env.NODE_ENV === 'production' ? '__Host-nutra_admin' : 'nutra_admin';

const hostOnly = (value: string | null | undefined) => (value || '').toLowerCase().trim();

/**
 * The console only answers on ADMIN_HOST. Without it, development serves it on any host and
 * production refuses unless ADMIN_ALLOW_SHARED_HOST=true is set deliberately.
 */
export function adminHostAllowed(host: string | null | undefined) {
  const expected = hostOnly(process.env.ADMIN_HOST);
  if (expected) return hostOnly(host) === expected || hostOnly(host).split(':')[0] === expected;
  return process.env.NODE_ENV !== 'production' || process.env.ADMIN_ALLOW_SHARED_HOST === 'true';
}

/** Cross-site forms cannot set custom headers, so this plus Origin and SameSite=Strict blocks CSRF. */
export function assertAdminMutation(req: NextRequest) {
  if (!acceptsOrigin(req) || req.headers.get('x-nutra-admin') !== '1')
    throw new ApiError('forbidden', 403);
}

const FALLBACK_HASH =
  '00000000000000000000000000000000:' + '0'.repeat(128);

export async function beginAdminLogin(email: string, password: string) {
  const normalized = email.toLowerCase().trim();
  await rateLimit(`admin-auth:${normalized.slice(0, 200)}`, 5);
  await rateLimit('admin-auth:global', 60);
  const admin = await db.adminAccount.findUnique({ where: { email: normalized } });
  const now = new Date();
  // Always hash so response time does not reveal whether the account exists.
  const valid = verifyPassword(password, admin?.passwordHash || FALLBACK_HASH);
  if (!admin || admin.status !== 'ACTIVE' || !admin.passwordHash || !admin.totpEnabledAt)
    throw new ApiError('credentials', 401);
  if (admin.lockedUntil && admin.lockedUntil > now) throw new ApiError('locked', 423);
  if (!valid) {
    const failures = admin.failedAttempts + 1;
    await db.adminAccount.update({
      where: { id: admin.id },
      data: {
        failedAttempts: failures >= MAX_FAILURES ? 0 : failures,
        lockedUntil: failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MS) : admin.lockedUntil,
      },
    });
    throw new ApiError(failures >= MAX_FAILURES ? 'locked' : 'credentials', failures >= MAX_FAILURES ? 423 : 401);
  }
  const token = randomBytes(32).toString('hex');
  await db.adminChallenge.deleteMany({ where: { OR: [{ adminId: admin.id }, { expiresAt: { lt: now } }] } });
  await db.adminChallenge.create({
    data: { id: tokenHash(token), adminId: admin.id, expiresAt: new Date(Date.now() + CHALLENGE_MS) },
  });
  return { challenge: token, admin };
}

/** Verifies a TOTP or recovery code. Returns the account update to persist, or null. */
function secondFactor(
  admin: { totpSecret: string | null; lastTotpStep: number | null; recoveryCodes: string },
  code: string,
) {
  const trimmed = code.replace(/\s/g, '');
  if (/^\d{6}$/.test(trimmed)) {
    if (!admin.totpSecret) return null;
    const step = verifyTotp(decryptSecret(admin.totpSecret), trimmed, admin.lastTotpStep);
    return step == null ? null : { lastTotpStep: step };
  }
  const remaining = consumeRecoveryCode(admin.recoveryCodes, trimmed);
  return remaining == null ? null : { recoveryCodes: remaining, usedRecovery: true as const };
}

export async function completeAdminLogin(challenge: string, code: string, userAgent: string) {
  await rateLimit('admin-mfa:global', 60);
  const now = new Date();
  const row = await db.adminChallenge.findUnique({ where: { id: tokenHash(challenge) } });
  if (!row || row.expiresAt < now || row.attempts >= 5) {
    if (row) await db.adminChallenge.delete({ where: { id: row.id } }).catch(() => {});
    throw new ApiError('challengeExpired', 401);
  }
  const admin = await db.adminAccount.findUnique({ where: { id: row.adminId } });
  if (!admin || admin.status !== 'ACTIVE') throw new ApiError('credentials', 401);
  const factor = secondFactor(admin, code);
  if (!factor) {
    await db.adminChallenge.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw new ApiError('invalidCode', 401);
  }
  const { usedRecovery, ...update } = factor as typeof factor & { usedRecovery?: true };
  const token = randomBytes(32).toString('hex');
  await db.$transaction([
    db.adminChallenge.delete({ where: { id: row.id } }),
    db.adminAccount.update({
      where: { id: admin.id },
      data: { ...update, failedAttempts: 0, lockedUntil: null, lastLoginAt: now },
    }),
    db.adminSession.deleteMany({ where: { adminId: admin.id, expiresAt: { lt: now } } }),
    db.adminSession.create({
      data: {
        id: tokenHash(token),
        adminId: admin.id,
        expiresAt: new Date(Date.now() + ADMIN_ABSOLUTE_MS),
        reauthAt: now,
        userAgent: userAgent.slice(0, 200),
      },
    }),
  ]);
  (await cookies()).set(adminCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: ADMIN_ABSOLUTE_MS / 1000,
  });
  return { admin, usedRecovery: !!usedRecovery };
}

export type AdminContext = Awaited<ReturnType<typeof loadAdmin>> & {};

async function loadAdmin() {
  const token = (await cookies()).get(adminCookieName())?.value;
  if (!token) return null;
  const session = await db.adminSession.findUnique({
    where: { id: tokenHash(token) },
    include: { admin: true },
  });
  const now = Date.now();
  if (!session) return null;
  if (
    +session.expiresAt <= now ||
    now - +session.lastSeenAt > ADMIN_IDLE_MS ||
    session.admin.status !== 'ACTIVE' ||
    !isAdminRole(session.admin.role)
  ) {
    await db.adminSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (now - +session.lastSeenAt > 60000)
    await db.adminSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  return { session, admin: session.admin };
}

/**
 * Authorizes one request server-side: host, session, idle/absolute expiry, account status,
 * role permission and (optionally) a recent step-up. Never trusts client-provided roles.
 */
export async function requireAdmin(
  req: NextRequest,
  permission?: Permission,
  options: { stepUp?: boolean } = {},
) {
  if (!adminHostAllowed(req.headers.get('host'))) throw new ApiError('notFound', 404);
  const context = await loadAdmin();
  if (!context) throw new ApiError('unauthorized', 401);
  await rateLimit(`admin:${context.admin.id}`, 300);
  if (permission && !can(context.admin.role, permission)) throw new ApiError('forbidden', 403);
  if (
    options.stepUp &&
    (!context.session.reauthAt || Date.now() - +context.session.reauthAt > STEP_UP_WINDOW_MS)
  )
    throw new ApiError('stepUpRequired', 403);
  return context;
}

/** For server-rendered admin pages: the signed-in administrator on an allowed host, or null. */
export async function currentAdminForPage(host: string | null) {
  if (!adminHostAllowed(host)) return null;
  return loadAdmin();
}

export async function stepUp(sessionId: string, code: string) {
  const session = await db.adminSession.findUnique({ where: { id: sessionId }, include: { admin: true } });
  if (!session) throw new ApiError('unauthorized', 401);
  await rateLimit(`admin-stepup:${session.adminId}`, 5);
  const factor = secondFactor(session.admin, code);
  if (!factor || 'usedRecovery' in factor) throw new ApiError('invalidCode', 401);
  await db.$transaction([
    db.adminAccount.update({ where: { id: session.adminId }, data: factor }),
    db.adminSession.update({ where: { id: sessionId }, data: { reauthAt: new Date() } }),
  ]);
}

export async function endAdminSession() {
  const jar = await cookies();
  const token = jar.get(adminCookieName())?.value;
  if (token) await db.adminSession.deleteMany({ where: { id: tokenHash(token) } });
  jar.delete(adminCookieName());
}

export function publicAdmin(
  admin: { id: string; email: string; name: string; role: string },
  session?: { reauthAt: Date | null; expiresAt: Date },
) {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    permissions: permissionsFor(admin.role),
    ...(session && {
      stepUpUntil: session.reauthAt ? new Date(+session.reauthAt + STEP_UP_WINDOW_MS) : null,
      expiresAt: session.expiresAt,
      idleTimeoutMs: ADMIN_IDLE_MS,
    }),
  };
}

export function validAdminPassword(password: string) {
  return (
    password.length >= MIN_ADMIN_PASSWORD &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password)
  );
}
export const hashAdminPassword = hashPassword;
