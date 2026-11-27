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
  const hostingerConfigured =
    process.env.HOSTINGER_MAIL_API_TOKEN && process.env.HOSTINGER_MAILBOX_ID;
  const resendConfigured = process.env.RESEND_API_KEY;
  return !!(
    (hostingerConfigured || resendConfigured) &&
    process.env.EMAIL_FROM &&
    process.env.APP_URL
  );
}

async function sendEmail(to: string, subject: string, text: string) {
  if (!passwordEmailConfigured()) throw new ApiError('emailUnavailable', 503);
  if (process.env.HOSTINGER_MAIL_API_TOKEN && process.env.HOSTINGER_MAILBOX_ID) {
    const response = await fetch(
      `https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(process.env.HOSTINGER_MAILBOX_ID)}/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.HOSTINGER_MAIL_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to: [to], display_name: 'Fitura+', subject, text }),
      },
    );
    if (!response.ok) throw new ApiError('emailUnavailable', 503);
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text }),
  });
  if (!response.ok) throw new ApiError('emailUnavailable', 503);
}

/** Creates a 24-hour verification token and emails the link. The token itself is never stored. */
export async function sendEmailVerification(user: { id: string; email: string }) {
  if (!passwordEmailConfigured()) throw new ApiError('emailUnavailable', 503);
  const token = randomBytes(32).toString('hex');
  await db.emailVerification.deleteMany({ where: { userId: user.id } });
  await db.emailVerification.create({
    data: { id: tokenHash(token), userId: user.id, expiresAt: new Date(Date.now() + 86400000) },
  });
  const link = `${process.env.APP_URL!.replace(/\/$/, '')}/verify-email?token=${token}`;
  await sendEmail(
    user.email,
    'Verify your Fitura+ email',
    `Verify your email address within 24 hours: ${link}`,
  );
}

/** Creates a 30-minute reset token and emails the link. The token itself is never stored. */
export async function sendPasswordReset(user: { id: string; email: string }) {
  if (!passwordEmailConfigured()) throw new ApiError('emailUnavailable', 503);
  const token = randomBytes(32).toString('hex');
  await db.passwordReset.create({
    data: { id: tokenHash(token), userId: user.id, expiresAt: new Date(Date.now() + 1800000) },
  });
  const link = `${process.env.APP_URL!.replace(/\/$/, '')}/reset?token=${token}`;
  await sendEmail(user.email, 'Fitura+‎ / איפוס סיסמה', `Reset your password / איפוס סיסמה: ${link}`);
}
