/**
 * Provisions administrator access from a trusted server shell. Nothing is hard-coded and no
 * password passes through the environment: the script prints a one-time setup link (72 h)
 * where the administrator chooses a password and enrols an authenticator app.
 *
 *   npm run admin:provision -- --email owner@example.com --name "Owner"
 *   npm run admin:provision -- --email owner@example.com --reset      (lost password / MFA)
 *   npm run admin:provision -- --email second@example.com --name "Ops" --allow-additional
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes, createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { z } from 'zod';

try {
  process.loadEnvFile();
} catch {
  /* Variables may be injected by the operator or container. */
}

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string', default: 'Super Admin' },
    reset: { type: 'boolean', default: false },
    'allow-additional': { type: 'boolean', default: false },
  },
});
const email = z.email().max(200).parse(values.email).toLowerCase();
const name = z.string().trim().min(2).max(100).parse(values.name);
const db = new PrismaClient();

function inviteUrl(token: string) {
  const host = process.env.ADMIN_HOST;
  const base = host ? `https://${host}` : (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/admin/setup?token=${token}`;
}

async function main() {
  const token = randomBytes(32).toString('hex');
  const invite = {
    inviteTokenHash: createHash('sha256').update(token).digest('hex'),
    inviteExpiresAt: new Date(Date.now() + 72 * 3600 * 1000),
  };
  const existing = await db.adminAccount.findUnique({ where: { email } });
  if (values.reset) {
    if (!existing) throw new Error('No administrator with that email.');
    await db.$transaction([
      db.adminAccount.update({
        where: { id: existing.id },
        data: { status: 'INVITED', passwordHash: null, totpSecret: null, totpEnabledAt: null, lastTotpStep: null, recoveryCodes: '', failedAttempts: 0, lockedUntil: null, ...invite },
      }),
      db.adminSession.deleteMany({ where: { adminId: existing.id } }),
    ]);
    await audit(existing.id, existing.email, 'provision.reset');
  } else {
    if (existing) throw new Error('An administrator with that email already exists. Use --reset to re-issue access.');
    const supers = await db.adminAccount.count({ where: { role: 'SUPER_ADMIN', status: { in: ['ACTIVE', 'INVITED'] } } });
    if (supers > 0 && !values['allow-additional'])
      throw new Error('A Super Admin already exists. Invite others from the console, or pass --allow-additional deliberately.');
    const created = await db.adminAccount.create({ data: { email, name, role: 'SUPER_ADMIN', status: 'INVITED', createdBy: 'provisioning-script', ...invite } });
    await audit(created.id, created.email, 'provision.create');
  }
  console.log('\nOne-time administrator setup link (valid 72 hours, shown once):\n');
  console.log('  ' + inviteUrl(token) + '\n');
  console.log('Open it on the admin host, choose a password and scan the QR code with an authenticator app.');
  console.log('Clear this terminal output afterwards.\n');
}

async function audit(adminId: string, adminEmail: string, action: string) {
  await db.adminAuditLog.create({
    data: { adminId, adminEmail, action, resourceType: 'admin', resourceId: adminId, details: JSON.stringify({ via: 'server shell' }), result: 'SUCCESS' },
  });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
