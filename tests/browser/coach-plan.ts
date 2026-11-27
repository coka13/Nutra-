/**
 * Gives a test coach the Trainer plan the way an administrator's complimentary grant does.
 * When a payment provider (PayPal or Stripe) is configured locally, a coach on the free plan
 * cannot invite clients; tests that exercise coaching need a coach who can.
 * Needs the server's DATABASE_URL in this process (read from .env when present).
 */
import { PrismaClient } from '@prisma/client';

try {
  process.loadEnvFile();
} catch {
  /* Variables may come from the environment. */
}

export async function grantCoachPlan(email: string) {
  const db = new PrismaClient();
  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
    await db.entitlementGrant.create({
      data: { userId: user.id, kind: 'COACH', source: 'ADMIN', reason: 'browser test' },
    });
  } finally {
    await db.$disconnect();
  }
}
