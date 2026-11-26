import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { db } from './db';
import { ApiError } from './auth';
import { tokenHash } from './security';

/**
 * Permanently removes an account (self-service or administrative). Foods still used in other
 * people's diaries, recipes or plans become shared records so their history stays intact.
 */
export async function deleteAccountData(tx: Prisma.TransactionClient, user: { id: string; email: string }) {
  await tx.program.deleteMany({ where: { ownerId: user.id } });
  await tx.mealEntry.deleteMany({ where: { userId: user.id } });
  await tx.recipe.deleteMany({ where: { userId: user.id } });
  await tx.mealPlan.deleteMany({ where: { userId: user.id } });
  await tx.food.updateMany({
    where: {
      ownerId: user.id,
      OR: [{ meals: { some: {} } }, { ingredients: { some: {} } }, { planItems: { some: {} } }],
    },
    data: { ownerId: null, source: 'private-retained' },
  });
  await tx.user.delete({ where: { id: user.id } });
  await tx.auditLog.deleteMany({ where: { actorId: user.id } });
  await tx.aIUsage.updateMany({ where: { userId: user.id }, data: { userId: null } });
  await tx.rateLimit.deleteMany({
    where: {
      key: { in: [`user:${user.id}`, `ai:${user.id}`, `billing:${user.id}`, `auth:${user.email}`] },
    },
  });
}

export function passwordEmailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Creates a 30-minute reset token and emails the link. The token itself is never stored. */
export async function sendPasswordReset(user: { id: string; email: string }) {
  if (!passwordEmailConfigured()) throw new ApiError('emailUnavailable', 503);
  const token = randomBytes(32).toString('hex');
  await db.passwordReset.create({
    data: { id: tokenHash(token), userId: user.id, expiresAt: new Date(Date.now() + 1800000) },
  });
  const link = `${process.env.APP_URL}/reset?token=${token}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [user.email],
      subject: 'Fitura+‎ / איפוס סיסמה',
      text: `Reset your password / איפוס סיסמה: ${link}`,
    }),
  });
  if (!response.ok) throw new ApiError('emailUnavailable', 503);
}
