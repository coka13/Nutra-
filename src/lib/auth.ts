import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { db } from './db';
import { tokenHash } from './security';
export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export async function currentUser() {
  const token = (await cookies()).get('nutri_session')?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: tokenHash(token) },
    include: { user: { include: { profile: true, subscription: true, branding: true } } },
  });
  return session && session.expiresAt > new Date() ? session.user : null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new ApiError('unauthorized', 401);
  return user;
}
export async function createSession(userId: string) {
  const jar = await cookies();
  const previous = jar.get('nutri_session')?.value;
  const token = randomBytes(32).toString('hex');
  await db.$transaction(async (tx) => {
    if (previous) await tx.session.deleteMany({ where: { id: tokenHash(previous) } });
    await tx.session.create({
      data: { id: tokenHash(token), userId, expiresAt: new Date(Date.now() + 7 * 86400000) },
    });
  });
  jar.set('nutri_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 86400,
  });
}
export async function signOut() {
  const jar = await cookies();
  const token = jar.get('nutri_session')?.value;
  if (token) await db.session.deleteMany({ where: { id: tokenHash(token) } });
  jar.delete('nutri_session');
}
export async function rateLimit(key: string, limit = 40) {
  const now = new Date();
  await db.$transaction(async (tx) => {
    const row = await tx.rateLimit.findUnique({ where: { key } });
    if (!row || row.resetsAt <= now)
      await tx.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, resetsAt: new Date(Date.now() + 60000) },
        update: { count: 1, resetsAt: new Date(Date.now() + 60000) },
      });
    else {
      if (row.count >= limit) throw new ApiError('rateLimited', 429);
      await tx.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
    }
  });
}
export async function audit(actorId: string, action: string) {
  await db.auditLog.create({ data: { actorId, action } });
}
export async function notify(userId: string, key: string) {
  const profile = await db.profile.findUnique({ where: { userId } });
  if (profile?.reminders === false) return;
  await db.notification.create({ data: { userId, key } });
}
