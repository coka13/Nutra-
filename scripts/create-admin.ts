import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hashPassword } from '../src/lib/security';
try {
  process.loadEnvFile();
} catch {
  /* Variables may be injected by an operator. */
}
const input = z
  .object({ email: z.email(), password: z.string().min(14).max(128) })
  .parse({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
const db = new PrismaClient();
try {
  const email = input.email.toLowerCase();
  if (await db.user.findUnique({ where: { email } }))
    throw new Error(
      'Account already exists. Use a reviewed database migration to change an existing role.',
    );
  await db.user.create({
    data: {
      email,
      name: 'Administrator',
      role: 'ADMIN',
      passwordHash: hashPassword(input.password),
      profile: { create: { adult: true, onboarded: true } },
      subscription: { create: {} },
    },
  });
  console.log('Administrator account created. Remove bootstrap credentials from the environment.');
} finally {
  await db.$disconnect();
}
