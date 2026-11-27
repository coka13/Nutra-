import type { Prisma } from '@prisma/client';
import { db } from './db';
import { activeGrantWhere } from './access';
import { realUserWhere } from './demo';

export const AUDIENCES = ['ALL', 'COACHES', 'INDEPENDENT', 'COACH_CLIENTS', 'PREMIUM', 'USERS'] as const;
export type Audience = (typeof AUDIENCES)[number];

/** Recipients are always active (not suspended) accounts. */
export function audienceWhere(audience: Audience, userIds: string[] = []): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { status: 'ACTIVE', role: { not: 'ADMIN' }, ...realUserWhere };
  switch (audience) {
    case 'COACHES':
      return { ...base, role: 'COACH' };
    case 'INDEPENDENT':
      return { ...base, role: 'INDEPENDENT', clientLinks: { none: { status: 'ACTIVE' } } };
    case 'COACH_CLIENTS':
      return { ...base, role: 'INDEPENDENT', clientLinks: { some: { status: 'ACTIVE' } } };
    case 'PREMIUM':
      return {
        ...base,
        OR: [
          { subscription: { status: 'ACTIVE', tier: { in: ['PREMIUM', 'COACH'] } } },
          { grants: { some: { ...activeGrantWhere(), kind: { in: ['PREMIUM', 'COACH'] } } } },
        ],
      };
    case 'USERS':
      return { ...base, id: { in: userIds.slice(0, 1000) } };
    default:
      return base;
  }
}

export const parseUserIds = (value: string) => value.split(',').map((v) => v.trim()).filter(Boolean);

type ExpoTicket = { status: 'ok' | 'error'; details?: { error?: string } };

/** Sends through Expo's push service (the mobile app uses expo-notifications). */
async function sendPush(tokens: { token: string }[], title: string, body: string) {
  let sent = 0,
    failed = 0;
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(process.env.EXPO_ACCESS_TOKEN && { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }),
        },
        body: JSON.stringify(chunk.map(({ token }) => ({ to: token, title, body, sound: 'default' }))),
      });
      const data = (await response.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
      const tickets = response.ok && Array.isArray(data?.data) ? data.data : [];
      if (!tickets.length) {
        failed += chunk.length;
        continue;
      }
      const stale: string[] = [];
      tickets.forEach((ticket, index) => {
        if (ticket.status === 'ok') sent++;
        else {
          failed++;
          if (ticket.details?.error === 'DeviceNotRegistered') stale.push(chunk[index].token);
        }
      });
      if (stale.length) await db.pushToken.deleteMany({ where: { token: { in: stale } } });
    } catch {
      failed += chunk.length;
    }
  }
  return { sent, failed };
}

/** Delivers one announcement exactly once (the SENDING claim prevents double sends). */
export async function deliverAnnouncement(id: string) {
  const claimed = await db.announcement.updateMany({
    where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } },
    data: { status: 'SENDING' },
  });
  if (!claimed.count) return null;
  const item = await db.announcement.findUniqueOrThrow({ where: { id } });
  try {
    const where = audienceWhere(item.audience as Audience, parseUserIds(item.userIds));
    const recipients = await db.user.findMany({
      where,
      select: { id: true, language: true, profile: { select: { reminders: true } } },
    });
    if (item.inApp)
      for (let i = 0; i < recipients.length; i += 500)
        await db.notification.createMany({
          data: recipients.slice(i, i + 500).map((r) => ({ userId: r.id, key: 'announcement', detail: item.id })),
        });
    let push = { sent: 0, failed: 0 };
    if (item.push) {
      const optedIn = recipients.filter((r) => r.profile?.reminders !== false);
      for (const language of ['en', 'he'] as const) {
        const ids = optedIn.filter((r) => (r.language === 'he' ? 'he' : 'en') === language).map((r) => r.id);
        if (!ids.length) continue;
        const tokens = await db.pushToken.findMany({ where: { userId: { in: ids } }, select: { token: true } });
        const result = await sendPush(
          tokens,
          language === 'he' ? item.titleHe : item.titleEn,
          language === 'he' ? item.bodyHe : item.bodyEn,
        );
        push = { sent: push.sent + result.sent, failed: push.failed + result.failed };
      }
    }
    return db.announcement.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), recipients: recipients.length, pushSent: push.sent, pushFailed: push.failed },
    });
  } catch (error) {
    await db.announcement.update({ where: { id }, data: { status: 'FAILED' } });
    throw error;
  }
}

export async function deliverDueAnnouncements(now = new Date()) {
  const due = await db.announcement.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
    select: { id: true },
    take: 20,
  });
  for (const { id } of due) await deliverAnnouncement(id);
  return due.length;
}
