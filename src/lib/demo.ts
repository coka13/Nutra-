import { randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from './security';

/**
 * Demo workspace.
 * Development keeps the seeded, shared `alex@nutri.local` account. Production gives every
 * visitor a private, throwaway account with sample records, removed after DEMO_TTL_MS, so
 * visitors never see or change each other's data.
 */
export const LEGACY_DEMO_EMAIL = 'alex@nutri.local';
const DEMO_DOMAIN = 'demo.fitura.invalid';
const DEMO_PREFIX = 'visitor-';
const DEMO_COACH_EMAIL = `coach@${DEMO_DOMAIN}`;
const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

export const demoEnabled = () => process.env.DEMO_ENABLED === 'true';

/** True for any account created for, or seeded as, the demo workspace. */
export const isDemoEmail = (email: string) =>
  email === LEGACY_DEMO_EMAIL || email.endsWith(`@${DEMO_DOMAIN}`);

/**
 * Excludes demo accounts. Demo visitors are stored as users so the app works for them, but
 * they are not real registrations: every admin count, list, export and send must use this.
 */
export const realUserWhere = {
  NOT: [{ email: LEGACY_DEMO_EMAIL }, { email: { endsWith: `@${DEMO_DOMAIN}` } }],
} satisfies Prisma.UserWhereInput;

const unusablePassword = () => hashPassword(randomBytes(32).toString('hex'));

/** Deletes expired visitor accounts; their records cascade with the user. */
export async function pruneDemoAccounts(db: PrismaClient) {
  await db.user.deleteMany({
    where: {
      email: { startsWith: DEMO_PREFIX, endsWith: `@${DEMO_DOMAIN}` },
      createdAt: { lt: new Date(Date.now() - DEMO_TTL_MS) },
    },
  });
}

async function demoCoach(db: PrismaClient) {
  return db.user.upsert({
    where: { email: DEMO_COACH_EMAIL },
    update: {},
    create: {
      email: DEMO_COACH_EMAIL,
      name: 'Noa Cohen',
      role: 'COACH',
      // Nobody signs in as the demo coach.
      passwordHash: unusablePassword(),
      profile: { create: { adult: true, onboarded: true } },
      subscription: { create: {} },
      branding: {
        create: {
          businessName: 'Noa · Move well',
          welcome: 'Welcome. Let’s build a routine that fits your life.',
        },
      },
    },
  });
}

/** Creates a private demo account with sample workouts, meals and progress. */
export async function createDemoAccount(db: PrismaClient, language: 'en' | 'he') {
  await pruneDemoAccounts(db);
  const coach = await demoCoach(db);
  const he = language === 'he';
  const timezone = 'Asia/Jerusalem';
  const day = (offset: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(
      new Date(Date.now() - offset * 86400000),
    );
  const today = day(0);
  const sessions = Array.from({ length: 24 }, (_, k) => 24 - k)
    .filter((i) => i % 7 === 0 || i % 7 === 3 || i % 7 === 5)
    .map((i) => {
      const startedAt = new Date(Date.now() - i * 86400000);
      return {
        name: he ? 'גוף מלא · בסיס' : 'Full body · Foundation',
        status: 'FINISHED',
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 38 * 60000),
        elapsedSeconds: 38 * 60,
        lastResumedAt: startedAt,
        weight: 10 + Math.floor((24 - i) / 8),
      };
    });

  const user = await db.user.create({
    data: {
      email: `${DEMO_PREFIX}${randomBytes(9).toString('hex')}@${DEMO_DOMAIN}`,
      name: he ? 'אלכס מורגן' : 'Alex Morgan',
      language,
      passwordHash: unusablePassword(),
      emailVerified: true,
      profile: {
        create: {
          adult: true,
          onboarded: true,
          timezone,
          birthYear: 1994,
          heightCm: 172,
          goal: 'strength',
          experience: 'intermediate',
          equipment: 'dumbbells',
        },
      },
      subscription: { create: {} },
      programs: {
        create: [
          {
            name: he ? 'גוף מלא · בסיס' : 'Full body · Foundation',
            description: he
              ? 'קצת יותר חזק, אימון אחד בכל פעם.'
              : 'A little stronger, one session at a time.',
            weeks: 4,
            days: '1,3,5',
            exercises: {
              create: [
                { exerciseId: 'squat', position: 0, sets: 3, reps: 12, rest: 60 },
                { exerciseId: 'row', position: 1, sets: 3, reps: 10, rest: 60, weight: 12 },
                { exerciseId: 'rdl', position: 2, sets: 3, reps: 10, rest: 90, weight: 16 },
                { exerciseId: 'pushup', position: 3, sets: 3, reps: 8, rest: 60 },
                { exerciseId: 'deadbug', position: 4, sets: 3, reps: 10, rest: 45 },
              ],
            },
          },
          {
            name: he ? 'תנועה והתאוששות' : 'Move & recharge',
            description: he
              ? 'תנועה עדינה לימי ההתאוששות.'
              : 'Gentle movement for your recovery days.',
            weeks: 4,
            days: '2,6',
            exercises: {
              create: [
                { exerciseId: 'bridge', position: 0, sets: 2, reps: 12, rest: 45 },
                { exerciseId: 'deadbug', position: 1, sets: 2, reps: 8, rest: 45 },
                { exerciseId: 'calf', position: 2, sets: 2, reps: 12, rest: 45 },
              ],
            },
          },
        ],
      },
      meals: {
        create: [
          { foodId: 'oats', grams: 60, meal: 'breakfast', date: today },
          { foodId: 'yogurt', grams: 200, meal: 'breakfast', date: today },
          { foodId: 'banana', grams: 120, meal: 'breakfast', date: today },
          { foodId: 'chicken', grams: 150, meal: 'lunch', date: today },
          { foodId: 'rice', grams: 180, meal: 'lunch', date: today },
          { foodId: 'salad', grams: 200, meal: 'lunch', date: today },
        ],
      },
      waters: { create: { ml: 750, date: today } },
      progress: {
        create: [
          ...Array.from({ length: 11 }, (_, k) => 20 - k * 2).map((i) => ({
            kind: 'energy',
            value: 5 + Math.floor((20 - i) / 6),
            unit: 'score',
            date: day(i),
          })),
          ...Array.from({ length: 6 }, (_, k) => 25 - k * 5).map((i) => ({
            kind: 'weight',
            value: Math.round((76 - (25 - i) * 0.06) * 10) / 10,
            unit: 'kg',
            date: day(i),
          })),
        ],
      },
    },
  });

  for (const { weight, ...session } of sessions)
    await db.workoutSession.create({
      data: {
        ...session,
        userId: user.id,
        sets: {
          create: [
            { exerciseId: 'row', setIndex: 0, reps: 10, weight, completed: true },
            { exerciseId: 'squat', setIndex: 0, reps: 12, weight: 0, completed: true },
          ],
        },
      },
    });
  await db.coachRelationship.create({
    data: { coachId: coach.id, clientId: user.id, status: 'ACTIVE', tags: 'strength, consistency' },
  });
  await db.message.create({
    data: {
      senderId: coach.id,
      recipientId: user.id,
      body: he
        ? 'כיף לראות שאת/ה מפנה זמן לעצמך. איך הרגיש האימון האחרון?'
        : 'Great to see you making time for yourself. How did your last session feel?',
    },
  });
  return user;
}
