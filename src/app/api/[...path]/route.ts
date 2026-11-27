import { NextRequest, NextResponse } from 'next/server';
import { adsenseUnit } from '@/lib/adsense';
import { LEGACY_DEMO_EMAIL, createDemoAccount, demoEnabled, isDemoEmail } from '@/lib/demo';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import {
  prepareBrandBackground,
  prepareBrandLogo,
  prepareProgressPhoto,
  saveBodyweight,
} from '@/lib/bodyweight';
import {
  AiUnavailable,
  chat,
  draftMenu,
  draftWorkout,
  recognizeMeal,
  SAFETY as AI_SAFETY,
} from '@/lib/ai';
import {
  ApiError,
  audit,
  createSession,
  currentUser,
  notify,
  rateLimit,
  requireUser,
  signOut,
} from '@/lib/auth';
import { hashPassword, tokenHash, verifyPassword } from '@/lib/security';
import { openBytes, sealBytes } from '@/lib/admin/crypto';
import { clientCapacity } from '@/lib/plans';
import { billingConfigured, paymentsConfigured } from '@/lib/billing';
import { paypalConfigured } from '@/lib/paypal';
import { activeGrantKinds, planRules, userEntitlements } from '@/lib/access';
import {
  deleteAccountData,
  passwordEmailConfigured,
  sendEmailVerification,
  sendPasswordReset,
} from '@/lib/account-ops';
import { aiConfigured, aiContext, assertAiAllowed } from '@/lib/ai-governance';
import { getConfig } from '@/lib/remote-config';
import { consentVersion, termsVersion } from '@/lib/legal';
import { recordRequest, routeGroup } from '@/lib/metrics';
import { applyExerciseOverrides } from '@/lib/content-overrides';
import { menuApplies, serializeWeekdays } from '@/lib/meal-schedule';
import { searchLocalFoods } from '@/lib/food-search';
import { foodAccess } from '@/lib/food-access';
import { clientAdherence } from '@/lib/adherence';
import { calendarDate } from '@/lib/workout-calendar';
import { workoutClockTransition } from '@/lib/workout-clock';
import { recordPerformance, recordLivePerformance } from '@/lib/performance';
import { planLiveSync, type PlanRow } from '@/lib/live-sync';
import { acceptsOrigin } from '@/lib/request-origin';
import { isInternationalPhone, normalizePhone } from '@/lib/phone';
import {
  completeExerciseLibrary,
  getFreeExercise,
  localizeCatalogExercise,
  hasExerciseAnimation,
} from '@/lib/free-exercises';
export const runtime = 'nodejs';
const text = z.string().trim().min(1).max(200);
const id = z.string().min(1).max(100);
/** Comma-separated weekdays (0 = Sunday); empty when a workout is not scheduled. */
const programDays = z
  .string()
  .regex(/^([0-6](,[0-6])*)?$/)
  .transform((value) => [...new Set(value.split(',').filter(Boolean))].sort().join(','));
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
const positive = z.number().positive().max(10000);
const phoneNumber = z.string().max(40).refine(isInternationalPhone).transform(normalizePhone);
const safeUser = (u: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  language: string;
  theme: string;
}) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  language: u.language,
  theme: u.theme,
});
/** Subscription, complimentary grants, remote plan rules and coach approval combined. */
const planAccess = userEntitlements;
async function related(coachId: string, clientId: string) {
  return !!(await db.coachRelationship.findFirst({
    where: { coachId, clientId, status: 'ACTIVE' },
  }));
}
const planItemsInclude = {
  items: {
    include: { food: { include: { units: { orderBy: { position: 'asc' } } } } },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.MealPlanInclude;
const mealName = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
/** Optional household amount, e.g. 4 × "ביצה"; grams stay the source of truth. */
const amount = {
  quantity: z.number().positive().max(1000).nullable().optional(),
  unitHe: z.string().trim().max(80).nullable().optional(),
  unitEn: z.string().trim().max(80).nullable().optional(),
};
/** Plans a user may read: their own, or ones an actively linked coach assigned to them. */
const readablePlan = (userId: string) => ({
  OR: [
    { userId },
    {
      assignedClientId: userId,
      user: { coachLinks: { some: { clientId: userId, status: 'ACTIVE' as const } } },
    },
  ],
});
async function authorizedTarget(user: { id: string; role: string }, target?: string | null) {
  if (!target || target === user.id) return user.id;
  if (user.role === 'COACH' && (await related(user.id, target))) return target;
  throw new ApiError('forbidden', 403);
}
const workoutDetails = {
  sets: {
    include: { exercise: true },
    orderBy: [{ position: 'asc' }, { exerciseId: 'asc' }, { setIndex: 'asc' }],
  },
  program: {
    include: { exercises: { include: { exercise: true }, orderBy: { position: 'asc' } } },
  },
} satisfies Prisma.WorkoutSessionInclude;

async function pauseOtherWorkouts(tx: Prisma.TransactionClient, userId: string, now: Date) {
  const active = await tx.workoutSession.findMany({ where: { userId, status: 'ACTIVE' } });
  for (const workout of active) {
    await tx.workoutSession.update({
      where: { id: workout.id },
      data: {
        ...workoutClockTransition(workout, now),
        status: 'PAUSED',
        restRemaining: workout.restUntil
          ? Math.max(0, Math.ceil((+workout.restUntil - +now) / 1000))
          : workout.restRemaining,
        restUntil: null,
      },
    });
  }
}

/** Applies an edited plan to every unfinished session started from it. */
async function syncLiveWorkouts(
  tx: Prisma.TransactionClient,
  programId: string,
  name: string,
  previous: PlanRow[],
  rows: PlanRow[],
) {
  const sessions = await tx.workoutSession.findMany({
    where: { programId, status: { in: ['ACTIVE', 'PAUSED'] } },
    include: { sets: true },
  });
  for (const session of sessions) {
    const plan = planLiveSync(session.sets, previous, rows);
    if (plan.remove.length)
      await tx.workoutSet.deleteMany({ where: { id: { in: plan.remove }, sessionId: session.id } });
    const changes = new Map(plan.update.map((change) => [change.id, change.data]));
    const reordered = plan.update.some((change) => change.data.position !== undefined);
    // Move every set out of the way first so swapped positions never collide on the unique key;
    // each remaining set is then written back at its final position.
    if (reordered)
      await tx.workoutSet.updateMany({
        where: { sessionId: session.id },
        data: { position: { decrement: 100000 } },
      });
    for (const set of session.sets) {
      if (plan.remove.includes(set.id) || (!reordered && !changes.has(set.id))) continue;
      await tx.workoutSet.update({
        where: { id: set.id },
        data: { position: set.position, ...changes.get(set.id) },
      });
    }
    if (plan.create.length)
      await tx.workoutSet.createMany({
        data: plan.create.map((set) => ({ ...set, sessionId: session.id })),
      });
    if (session.name !== name)
      await tx.workoutSession.update({ where: { id: session.id }, data: { name } });
  }
}

async function handle(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const started = performance.now();
  const path = (await context.params).path.join('/');
  const response = await handleRequest(req, path);
  let code = '';
  if (response.status >= 400)
    code = await response
      .clone()
      .json()
      .then((body: { error?: unknown }) => (typeof body.error === 'string' ? body.error : ''))
      .catch(() => '');
  recordRequest({
    route: routeGroup(path),
    method: req.method,
    status: response.status,
    durationMs: performance.now() - started,
    code,
  });
  return response;
}

async function handleRequest(req: NextRequest, path: string) {
  try {
    // Maintenance mode answers every call except session lookup and sign-out.
    if (path !== 'auth/me' && path !== 'auth/logout') {
      const { maintenance } = await getConfig();
      if (maintenance.enabled)
        return NextResponse.json(
          {
            error: 'maintenance',
            messageEn: maintenance.messageEn,
            messageHe: maintenance.messageHe,
          },
          { status: 503, headers: { 'Retry-After': '300' } },
        );
    }
    if (req.method !== 'GET') {
      if (!acceptsOrigin(req)) throw new ApiError('forbidden', 403);
      if (
        Number(req.headers.get('content-length') || 0) >
        (path === 'progress/bodyweight' || path === 'branding/background'
          ? 300000
          : path === 'ai/photo'
            ? 150000
            : 100000)
      )
        throw new ApiError('invalid', 413);
    }
    if (path === 'auth/me') {
      const u = await currentUser();
      return NextResponse.json(
        u
          ? {
              user: safeUser(u),
              profile: u.profile,
              subscription: u.subscription,
              branding: u.branding,
            }
          : { user: null },
      );
    }
    if (req.method === 'POST' && path.startsWith('auth/')) {
      const body = z.record(z.string(), z.unknown()).parse(await req.json());
      // Shared database counter: no trust in user-controlled forwarding headers.
      await rateLimit(
        `auth:${typeof body.email === 'string' ? body.email.toLowerCase().slice(0, 200) : 'demo'}`,
        // Demo logins share one key; allow a handful of concurrent visitors.
        path === 'auth/demo' ? 30 : 10,
      );
      await rateLimit('auth:global', 250);
      if (path === 'auth/logout') {
        await signOut();
        return NextResponse.json({ ok: true });
      }
      if (path === 'auth/demo') {
        if (!demoEnabled()) throw new ApiError('unavailable', 503);
        const { language } = z.object({ language: z.enum(['en', 'he']).optional() }).parse(body);
        if (process.env.NODE_ENV === 'production') {
          // Every visitor gets a private, temporary account (see lib/demo).
          const user = await createDemoAccount(db, language ?? 'he');
          await createSession(user.id);
          return NextResponse.json({ user: safeUser(user) });
        }
        const u = await db.user.findUnique({ where: { email: LEGACY_DEMO_EMAIL } });
        if (!u) throw new ApiError('unavailable', 503);
        const user = language
          ? await db.user.update({ where: { id: u.id }, data: { language } })
          : u;
        await createSession(user.id);
        return NextResponse.json({ user: safeUser(user) });
      }
      if (['auth/register', 'auth/user/register', 'auth/coach/register'].includes(path)) {
        const role =
          path === 'auth/coach/register'
            ? 'COACH'
            : path === 'auth/user/register'
              ? 'INDEPENDENT'
              : body.role;
        const data = z
          .object({
            name: text,
            email: z.email().max(200),
            phone: role === 'COACH' ? phoneNumber : phoneNumber.optional(),
            password: z.string().min(10).max(128),
            role: z.enum(['INDEPENDENT', 'COACH']),
            language: z.enum(['en', 'he']).default('en'),
          })
          .parse({ ...body, role });
        // Explicit consent: the user confirms they are 18+ and accept the Terms of Use.
        if (body.acceptTerms !== true) throw new ApiError('termsRequired', 400);
        const verificationRequired = passwordEmailConfigured();
        if (process.env.NODE_ENV === 'production' && !verificationRequired)
          throw new ApiError('emailUnavailable', 503);
        const { features } = await getConfig();
        if (data.role === 'COACH' ? !features.coachRegistration : !features.userRegistration)
          throw new ApiError('registrationClosed', 403);
        if (await db.user.findUnique({ where: { email: data.email.toLowerCase() } }))
          throw new ApiError('emailTaken', 409);
        const { password, ...rest } = data;
        // Trainees log health data, so they also give explicit consent for it (GDPR art. 9).
        // Older app versions do not send it yet; the app then asks once after sign-in.
        const healthConsent = data.role !== 'COACH' && body.healthConsent === true;
        const u = await db.user.create({
          data: {
            ...rest,
            consentVersion,
            ...(healthConsent && { healthConsentAt: new Date() }),
            emailVerified: !verificationRequired,
            ...(data.role === 'COACH' &&
              features.coachApprovalRequired && { coachStatus: 'PENDING' }),
            email: data.email.toLowerCase(),
            passwordHash: hashPassword(password),
            profile: { create: {} },
            subscription: { create: {} },
          },
        });
        if (verificationRequired) await sendEmailVerification(u);
        else await createSession(u.id);
        await audit(u.id, 'REGISTER');
        await audit(u.id, `TERMS_ACCEPTED:${termsVersion}`);
        if (healthConsent) await audit(u.id, `HEALTH_CONSENT:${consentVersion}`);
        return NextResponse.json(
          verificationRequired ? { verificationRequired: true } : { user: safeUser(u) },
        );
      }
      if (path === 'auth/verify-email') {
        const data = z.object({ token: id }).parse(body);
        await db.$transaction(async (tx) => {
          const verification = await tx.emailVerification.findUnique({
            where: { id: tokenHash(data.token) },
          });
          if (!verification || verification.expiresAt < new Date())
            throw new ApiError('invalidVerification', 400);
          await tx.user.update({
            where: { id: verification.userId },
            data: { emailVerified: true },
          });
          await tx.emailVerification.deleteMany({ where: { userId: verification.userId } });
        });
        return NextResponse.json({ ok: true });
      }
      if (path === 'auth/resend-verification') {
        if (!passwordEmailConfigured()) throw new ApiError('emailUnavailable', 503);
        const { email } = z.object({ email: z.email() }).parse(body);
        const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
        if (user && !user.emailVerified && user.status !== 'SUSPENDED')
          await sendEmailVerification(user);
        return NextResponse.json({ ok: true });
      }
      if (
        ['auth/login', 'auth/coach-login', 'auth/user/login', 'auth/coach/login'].includes(path)
      ) {
        const data = z
          .object({
            email: z.email(),
            password: z.string().max(128),
            language: z.enum(['en', 'he']).optional(),
          })
          .parse(body);
        const u = await db.user.findUnique({ where: { email: data.email.toLowerCase() } });
        const fallback =
          '00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
        if (!verifyPassword(data.password, u?.passwordHash || fallback) || !u)
          throw new ApiError('credentials', 401);
        if (
          (['auth/coach/login', 'auth/coach-login'].includes(path) && u.role !== 'COACH') ||
          (path === 'auth/user/login' && u.role !== 'INDEPENDENT')
        ) {
          throw new ApiError('credentials', 401);
        }
        // Checked only after the password, so it reveals nothing to someone guessing.
        if (u.status === 'SUSPENDED') throw new ApiError('accountSuspended', 403);
        if (!u.emailVerified) throw new ApiError('emailUnverified', 403);
        const user = data.language
          ? await db.user.update({ where: { id: u.id }, data: { language: data.language } })
          : u;
        await createSession(user.id);
        return NextResponse.json({ user: safeUser(user) });
      }
      if (path === 'auth/recover') {
        const { email } = z.object({ email: z.email() }).parse(body);
        if (!passwordEmailConfigured()) throw new ApiError('emailUnavailable', 503);
        const u = await db.user.findUnique({ where: { email: email.toLowerCase() } });
        if (u && u.status !== 'SUSPENDED') await sendPasswordReset(u);
        return NextResponse.json({ ok: true });
      }
      if (path === 'auth/reset') {
        const data = z.object({ token: id, password: z.string().min(10).max(128) }).parse(body);
        await db.$transaction(async (tx) => {
          const reset = await tx.passwordReset.findUnique({ where: { id: tokenHash(data.token) } });
          if (!reset || reset.expiresAt < new Date()) throw new ApiError('invalid');
          await tx.user.update({
            where: { id: reset.userId },
            data: { passwordHash: hashPassword(data.password) },
          });
          await tx.session.deleteMany({ where: { userId: reset.userId } });
          await tx.passwordReset.deleteMany({ where: { userId: reset.userId } });
        });
        return NextResponse.json({ ok: true });
      }
      throw new ApiError('notFound', 404);
    }
    const u = await requireUser();
    await rateLimit(`user:${u.id}`, 120);
    if (req.method === 'GET') {
      const target = await authorizedTarget(u, req.nextUrl.searchParams.get('userId'));
      if (path === 'coach/active-workouts') {
        if (u.role !== 'COACH' || target !== u.id) throw new ApiError('forbidden', 403);
        const workouts = await db.workoutSession.findMany({
          where: {
            status: { in: ['ACTIVE', 'PAUSED'] },
            user: { clientLinks: { some: { coachId: u.id, status: 'ACTIVE' } } },
          },
          select: {
            userId: true,
            id: true,
            name: true,
            status: true,
            sets: { select: { completed: true } },
          },
        });
        return NextResponse.json(
          workouts.map(({ sets, ...workout }) => ({
            ...workout,
            completed: sets.filter((set) => set.completed).length,
            total: sets.length,
          })),
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }
      if (path === 'progress/bodyweight') {
        const records = await db.progressRecord.findMany({
          where: { userId: target, kind: 'weight' },
          include: { photos: { select: { id: true }, orderBy: { createdAt: 'asc' } } },
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
        });
        return NextResponse.json(records, { headers: { 'Cache-Control': 'private, no-store' } });
      }
      if (path === 'progress/photos') {
        const photoId = req.nextUrl.searchParams.get('id');
        const headers = {
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        };
        if (photoId) {
          const photo = await db.progressPhoto.findFirst({
            where: { id: photoId, userId: target },
          });
          if (!photo) throw new ApiError('notFound', 404);
          return new NextResponse(new Uint8Array(openBytes(photo.image)), {
            headers: { ...headers, 'Content-Type': 'image/jpeg' },
          });
        }
        const photos = await db.progressPhoto.findMany({
          where: { userId: target },
          select: { id: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 100,
        });
        return NextResponse.json(photos, { headers });
      }
      if (path === 'branding/logo' || path === 'branding/background') {
        // Visible to the coach and to anyone linked to them, including pending invitees.
        const coachId = req.nextUrl.searchParams.get('coachId') || u.id;
        if (
          coachId !== u.id &&
          !(await db.coachRelationship.findFirst({
            where: { coachId, clientId: u.id, status: { in: ['ACTIVE', 'PENDING'] } },
            select: { id: true },
          }))
        )
          throw new ApiError('notFound', 404);
        const logo =
          path === 'branding/logo'
            ? await db.brandLogo.findUnique({ where: { userId: coachId } })
            : await db.brandBackground.findUnique({ where: { userId: coachId } });
        if (!logo) throw new ApiError('notFound', 404);
        return new NextResponse(Buffer.from(logo.image), {
          headers: {
            'Content-Type': 'image/jpeg',
            // The URL carries the logo version, so a private cache is safe.
            'Cache-Control': 'private, max-age=86400',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      if (path === 'performance') {
        const exerciseId = req.nextUrl.searchParams.get('exerciseId') || undefined;
        const [records, history] = await Promise.all([
          db.exercisePerformance.groupBy({
            by: ['exerciseId'],
            where: { userId: target, exerciseId },
            _max: { weight: true, reps: true, estimate: true, volume: true },
          }),
          exerciseId
            ? db.exercisePerformance.findMany({
                where: { userId: target, exerciseId },
                orderBy: { finishedAt: 'desc' },
                take: 200,
              })
            : [],
        ]);
        return NextResponse.json(
          { records, history },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }
      if (path === 'state') {
        // Without an explicit date, "today" is the user's own calendar day, not UTC's:
        // late in the evening in Israel the UTC date is still yesterday.
        const requestedDate = req.nextUrl.searchParams.get('date');
        const date = day.parse(
          requestedDate ||
            calendarDate(
              new Date(),
              (
                await db.profile.findUnique({
                  where: { userId: u.id },
                  select: { timezone: true },
                })
              )?.timezone || 'Asia/Jerusalem',
            ),
        );
        const activeLinks = await db.coachRelationship.findMany({
          where: { OR: [{ coachId: u.id }, { clientId: u.id }] },
          include: {
            coach: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                branding: {
                  select: {
                    businessName: true,
                    color: true,
                    welcome: true,
                    logoAt: true,
                    backgroundAt: true,
                  },
                },
              },
            },
            client: { select: { id: true, name: true, email: true } },
          },
        });
        const accepted = activeLinks.filter((l) => l.status === 'ACTIVE');
        const visiblePrograms =
          target === u.id
            ? {
                OR: [
                  { ownerId: u.id },
                  { assignedClientId: u.id, ownerId: { in: accepted.map((l) => l.coachId) } },
                ],
              }
            : { OR: [{ ownerId: target }, { ownerId: u.id, assignedClientId: target }] };
        const [
          programs,
          workouts,
          meals,
          water,
          progress,
          appointments,
          messages,
          notifications,
          recipes,
          mealPlans,
        ] = await Promise.all([
          db.program.findMany({
            where: visiblePrograms,
            include: { exercises: { include: { exercise: true }, orderBy: { position: 'asc' } } },
            orderBy: { createdAt: 'desc' },
          }),
          db
            .$transaction([
              db.workoutSession.findMany({
                where: { userId: target, status: { in: ['ACTIVE', 'PAUSED'] } },
                include: workoutDetails,
                orderBy: { startedAt: 'desc' },
              }),
              db.workoutSession.findMany({
                where: { userId: target, status: 'FINISHED' },
                include: workoutDetails,
                orderBy: { startedAt: 'desc' },
                take: 150,
              }),
              db.workoutSession.findMany({
                where: { userId: target, status: 'FINISHED' },
                select: {
                  id: true,
                  name: true,
                  programId: true,
                  startedAt: true,
                  status: true,
                  sets: { where: { completed: true }, select: { completed: true }, take: 1 },
                },
              }),
            ])
            .then(([unfinished, finished, history]) => ({
              detailed: [...unfinished, ...finished].sort((a, b) => +b.startedAt - +a.startedAt),
              calendar: [...unfinished, ...history].map(
                ({ id, name, programId, startedAt, status, sets }) => ({
                  id,
                  name,
                  programId,
                  startedAt,
                  status,
                  sets: sets
                    .filter((set) => set.completed)
                    .slice(0, 1)
                    .map(() => ({ completed: true })),
                }),
              ),
            })),
          db.mealEntry.findMany({
            where: { userId: target, date },
            include: { food: true },
            orderBy: { createdAt: 'asc' },
          }),
          db.waterEntry.findMany({ where: { userId: target, date } }),
          db.progressRecord
            .findMany({
              where: { userId: target },
              orderBy: { date: 'desc' },
              take: 500,
            })
            .then((records) => records.reverse()),
          db.appointment.findMany({
            where: { OR: [{ ownerId: u.id }, { guestId: u.id }] },
            orderBy: { startsAt: 'asc' },
          }),
          db.message
            .findMany({
              where: { OR: [{ senderId: u.id }, { recipientId: u.id }] },
              orderBy: { createdAt: 'desc' },
              take: 300,
            })
            .then((messages) => messages.reverse()),
          db.notification.findMany({
            where: { userId: u.id },
            orderBy: { createdAt: 'desc' },
            take: 30,
          }),
          db.recipe.findMany({
            where: { userId: target },
            include: { ingredients: { include: { food: true } } },
          }),
          db.mealPlan.findMany({
            where: {
              OR: [
                { userId: u.id },
                { assignedClientId: u.id, userId: { in: accepted.map((l) => l.coachId) } },
              ],
            },
            include: planItemsInclude,
          }),
        ]);
        return NextResponse.json(
          {
            user: safeUser(u),
            // Whether the current Terms/Privacy and (for trainees) health-data consent are on record.
            consent: {
              terms: u.consentVersion === consentVersion,
              health: u.role === 'COACH' || u.role === 'ADMIN' || !!u.healthConsentAt,
            },
            clockAt: Date.now(),
            // A coach viewing a client sees the client's profile (e.g. nutrition targets).
            profile:
              target === u.id
                ? u.profile
                : await db.profile.findUnique({ where: { userId: target } }),
            subscription: u.subscription,
            branding: u.branding,
            programs: programs
              .filter((program) =>
                program.exercises.some((row) => hasExerciseAnimation(row.exercise)),
              )
              .map((program) => ({
                ...program,
                exercises: program.exercises
                  .filter((row) => hasExerciseAnimation(row.exercise))
                  .map((row) => ({
                    ...row,
                    exercise: localizeCatalogExercise(row.exercise),
                  })),
              })),
            calendarWorkouts: workouts.calendar,
            workouts: workouts.detailed
              .filter(
                (workout) =>
                  workout.status === 'FINISHED' ||
                  workout.sets.some((set) => hasExerciseAnimation(set.exercise)),
              )
              .map((workout) => ({
                ...workout,
                sets: workout.sets
                  .filter(
                    (set) => workout.status === 'FINISHED' || hasExerciseAnimation(set.exercise),
                  )
                  .map((set) => ({
                    ...set,
                    exercise: localizeCatalogExercise(set.exercise),
                  })),
              })),
            meals: u.role === 'COACH' && target === u.id ? [] : meals,
            water: u.role === 'COACH' && target === u.id ? [] : water,
            progress,
            appointments,
            messages,
            notifications,
            // Administrative announcements referenced by in-app notifications.
            announcements: await db.announcement.findMany({
              where: {
                id: {
                  in: notifications.filter((n) => n.key === 'announcement').map((n) => n.detail),
                },
              },
              select: { id: true, titleEn: true, titleHe: true, bodyEn: true, bodyHe: true },
            }),
            coachStatus: u.role === 'COACH' ? u.coachStatus : null,
            relationships: activeLinks.map((l) =>
              l.coachId === u.id ? l : { ...l, notes: '', tags: '' },
            ),
            recipes,
            mealPlans,
            mealChecks:
              u.role === 'COACH'
                ? []
                : await db.mealPlanCheck.findMany({
                    where: { userId: u.id, date, planId: { in: mealPlans.map((plan) => plan.id) } },
                    select: { planId: true, meal: true },
                  }),
            ...(await (async () => {
              const entitlements = await planAccess(u);
              return { entitlements, adsense: entitlements.ads ? adsenseUnit() : null };
            })()),
            integrations: await (async () => {
              const [ai, { ai: aiConfig }] = await Promise.all([aiConfigured(), getConfig()]);
              return {
                ai: ai && aiConfig.enabled,
                email: passwordEmailConfigured(),
                billing: billingConfigured() || paypalConfigured(),
                card: billingConfigured(),
                paypal: paypalConfigured(),
                whatsapp: false,
                health: false,
                photo: ai && aiConfig.enabled && aiConfig.features.photo,
              };
            })(),
            // Marks the demo workspace only for demo accounts, never for real users.
            demo: isDemoEmail(u.email),
          },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      if (path === 'foods/search') {
        // Local database only — no external calls at runtime.
        const q = z
          .string()
          .trim()
          .min(1)
          .max(80)
          .parse(req.nextUrl.searchParams.get('q') ?? '');
        const lang = u.language === 'he' ? 'he' : 'en';
        return NextResponse.json(
          { results: await searchLocalFoods(db, u.id, q, lang) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }
      if (path === 'library')
        return NextResponse.json({
          exercises: await applyExerciseOverrides(
            completeExerciseLibrary(await db.exercise.findMany()),
          ),
          // The bundled datasets are searched server-side, not shipped to every client.
          foods: await db.food.findMany({
            include: { units: { orderBy: { position: 'asc' } } },
            where: {
              OR: [
                {
                  ownerId: null,
                  source: {
                    notIn: [
                      'usda',
                      'openfoodfacts',
                      'tzameret',
                      'private-retained',
                      'user-estimate',
                      'ai-photo-estimate',
                    ],
                  },
                },
                { ownerId: u.id },
              ],
            },
          }),
        });
      if (path === 'export') {
        const data = {
          user: safeUser(u),
          profile: u.profile,
          branding: u.branding,
          subscription: u.subscription,
          foods: await db.food.findMany({ where: { ownerId: u.id } }),
          payments: await db.payment.findMany({ where: { userId: u.id } }),
          aiInteractions: await db.aIInteraction.findMany({ where: { userId: u.id } }),
          notifications: await db.notification.findMany({ where: { userId: u.id } }),
          programs: await db.program.findMany({
            where: { ownerId: u.id },
            include: { exercises: true },
          }),
          workouts: await db.workoutSession.findMany({
            where: { userId: u.id },
            include: { sets: true },
          }),
          meals: await db.mealEntry.findMany({ where: { userId: u.id }, include: { food: true } }),
          progress: await db.progressRecord.findMany({ where: { userId: u.id } }),
          // Complete copy for data-access requests: photos are included as base64 JPEG.
          progressPhotos: (
            await db.progressPhoto.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' } })
          ).map(({ image, ...photo }) => ({
            ...photo,
            jpegBase64: openBytes(image).toString('base64'),
          })),
          exercisePerformance: await db.exercisePerformance.findMany({ where: { userId: u.id } }),
          mealPlanChecks: await db.mealPlanCheck.findMany({ where: { userId: u.id } }),
          grants: await db.entitlementGrant.findMany({
            where: { userId: u.id },
            select: { kind: true, source: true, startsAt: true, endsAt: true, revokedAt: true },
          }),
          supportTickets: await db.supportTicket.findMany({
            where: { userId: u.id },
            select: {
              id: true,
              category: true,
              subject: true,
              status: true,
              createdAt: true,
              messages: {
                where: { internal: false },
                select: { authorType: true, body: true, createdAt: true },
              },
            },
          }),
          devices: await db.pushToken.findMany({
            where: { userId: u.id },
            select: { platform: true, createdAt: true },
          }),
          activeDays: (
            await db.userActivityDay.findMany({ where: { userId: u.id }, select: { date: true } })
          ).map((row) => row.date),
          cardioActivities: await db.cardioActivity.findMany({ where: { userId: u.id } }),
          dailySteps: await db.dailySteps.findMany({ where: { userId: u.id } }),
          coachPackages:
            u.role === 'COACH'
              ? await db.coachPackage.findMany({
                  where: { relationship: { coachId: u.id } },
                  include: { sessions: true, receipts: true },
                })
              : [],
          water: await db.waterEntry.findMany({ where: { userId: u.id } }),
          recipes: await db.recipe.findMany({
            where: { userId: u.id },
            include: { ingredients: true },
          }),
          mealPlans: await db.mealPlan.findMany({
            where: { userId: u.id },
            include: { items: true },
          }),
          appointments: await db.appointment.findMany({
            where: { OR: [{ ownerId: u.id }, { guestId: u.id }] },
          }),
          messages: await db.message.findMany({
            where: { OR: [{ senderId: u.id }, { recipientId: u.id }] },
          }),
          relationships: await db.coachRelationship.findMany({
            where: { OR: [{ coachId: u.id }, { clientId: u.id }] },
            select: { coachId: true, clientId: true, status: true },
          }),
        };
        return new NextResponse(JSON.stringify(data, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="fitura-export.json"',
            'Cache-Control': 'no-store',
          },
        });
      }
      if (path === 'admin') {
        if (u.role !== 'ADMIN') throw new ApiError('forbidden', 403);
        return NextResponse.json({
          users: await db.user.findMany({
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              createdAt: true,
              subscription: true,
            },
          }),
          flags: await db.featureFlag.findMany(),
          audit: await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
        });
      }
      throw new ApiError('notFound', 404);
    }
    if (req.method !== 'POST') throw new ApiError('notFound', 404);
    const body = await req.json();
    let result: unknown = { ok: true };
    switch (path) {
      case 'programs/generate': {
        if (u.role === 'COACH') throw new ApiError('forbidden', 403);
        const profile = u.profile;
        if (!profile?.onboarded) throw new ApiError('invalid');
        const pool = await db.exercise.findMany({
          where: {
            OR: [{ equipment: 'bodyweight' }, { equipment: profile.equipment }],
            ...(profile.experience === 'beginner' ? { difficulty: 'beginner' } : {}),
          },
        });
        const animatedPool = pool.filter(hasExerciseAnimation);
        const selected = ['legs', 'back', 'chest', 'core']
          .map((m) => animatedPool.find((e) => e.muscle === m))
          .filter((e): e is NonNullable<typeof e> => !!e);
        if (!selected.length) throw new ApiError('animationRequired', 400);
        const days =
          profile.frequency <= 3
            ? [1, 3, 5].slice(0, profile.frequency)
            : [1, 2, 3, 4, 5, 6].slice(0, profile.frequency);
        result = await db.program.create({
          data: {
            ownerId: u.id,
            name: u.language === 'he' ? 'השגרה שלי · התחלה מאוזנת' : 'My routine · Balanced start',
            description:
              u.language === 'he'
                ? 'תבנית כללית לעריכה. התאימו לצרכים שלכם וצרו קשר עם איש מקצוע לגבי מגבלות גופניות.'
                : 'An editable general template. Adapt to your needs and consult a professional about physical limitations.',
            weeks: 0,
            days: days.join(','),
            exercises: {
              create: selected.map((e, position) => ({
                exerciseId: e.id,
                position,
                sets: profile.duration < 30 ? 2 : 3,
                reps: profile.experience === 'beginner' ? 8 : 10,
                weight: 0,
                rest: 60,
              })),
            },
          },
        });
        break;
      }
      case 'profile': {
        const schema = z.object({
          name: text,
          phone: phoneNumber.optional(),
          language: z.enum(['en', 'he']),
          theme: z.enum(['light', 'dark']),
          heightCm: z.number().min(50).max(260).nullable().optional(),
          birthYear: z
            .number()
            .int()
            .min(1900)
            .max(new Date().getUTCFullYear())
            .nullable()
            .optional(),
          weightKg: z.number().positive().max(700).optional(),
          goal: z.enum(['consistency', 'strength', 'energy', 'mobility']),
          experience: z.enum(['beginner', 'intermediate', 'advanced']),
          equipment: z.enum(['bodyweight', 'dumbbells', 'gym']),
          frequency: z.number().int().min(1).max(6),
          duration: z.number().int().min(10).max(90),
          dietary: z.string().max(500),
          limitations: z.string().max(500),
          units: z.enum(['metric', 'imperial']),
          timezone: z.string().refine((v) => {
            try {
              new Intl.DateTimeFormat('en', { timeZone: v });
              return true;
            } catch {
              return false;
            }
          }),
          adult: z.boolean(),
          aiConsent: z.boolean(),
          reminders: z.boolean(),
          onboarded: z.boolean(),
        });
        const data = (
          u.role === 'COACH'
            ? schema.omit({
                heightCm: true,
                birthYear: true,
                weightKg: true,
                goal: true,
                experience: true,
                equipment: true,
                frequency: true,
                duration: true,
                dietary: true,
                limitations: true,
                units: true,
              })
            : schema
        ).parse(body);
        const { name, phone, language, theme, weightKg, ...profile } = data as Partial<
          z.infer<typeof schema>
        > &
          Pick<z.infer<typeof schema>, 'name' | 'language' | 'theme' | 'timezone'>;
        await db.$transaction(async (tx) => {
          const birthYear =
            profile.birthYear === undefined ? u.profile?.birthYear : profile.birthYear;
          if (birthYear && new Date().getUTCFullYear() - birthYear < 18) {
            profile.adult = false;
            profile.aiConsent = false;
          }
          await tx.user.update({
            where: { id: u.id },
            data: {
              name,
              phone,
              language,
              theme,
              profile: { upsert: { create: profile, update: profile } },
            },
          });
          if (weightKg !== undefined) {
            const date = new Intl.DateTimeFormat('en-CA', {
              timeZone: profile.timezone,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(new Date());
            await saveBodyweight(tx, u.id, { value: weightKg, date });
          }
        });
        break;
      }
      case 'account/consent': {
        const input = z
          .object({ acceptTerms: z.literal(true), healthConsent: z.boolean().default(false) })
          .parse(body);
        const needsHealth = u.role !== 'COACH' && u.role !== 'ADMIN';
        if (needsHealth && !input.healthConsent && !u.healthConsentAt)
          throw new ApiError('healthConsentRequired', 400);
        await db.user.update({
          where: { id: u.id },
          data: {
            consentVersion,
            ...(needsHealth && !u.healthConsentAt && { healthConsentAt: new Date() }),
          },
        });
        await audit(u.id, `TERMS_ACCEPTED:${consentVersion}`);
        if (needsHealth && !u.healthConsentAt) await audit(u.id, `HEALTH_CONSENT:${consentVersion}`);
        break;
      }
      case 'preferences': {
        const data = z
          .object({
            language: z.enum(['en', 'he']).optional(),
            theme: z.enum(['light', 'dark']).optional(),
          })
          .parse(body);
        await db.user.update({ where: { id: u.id }, data });
        break;
      }
      case 'programs/save': {
        const data = z
          .object({
            id: id.optional(),
            name: text,
            description: z.string().max(1000).default(''),
            // Zero represents an ongoing weekly schedule; retain legacy durations.
            weeks: z.number().int().min(0).max(52).default(0),
            // Empty = not scheduled yet (e.g. a reusable template).
            days: programDays,
            template: z.boolean().default(false),
            assignedClientId: id.nullable().optional(),
            exercises: z
              .array(
                z
                  .object({
                    exerciseId: id,
                    sets: z.number().int().min(1).max(10),
                    reps: z.number().int().min(1).max(100),
                    // 0 = a single target; otherwise the top of a range such as 8-12.
                    repsMax: z.number().int().min(0).max(100).default(0),
                    rest: z.number().int().min(0).max(600),
                    weight: z.number().min(0).max(1000),
                    notes: z.string().max(300).default(''),
                    group: z.string().max(40).default(''),
                  })
                  .refine((row) => row.repsMax === 0 || row.repsMax >= row.reps),
              )
              .min(1)
              .max(30),
          })
          .parse(body);
        if (
          data.assignedClientId &&
          (u.role !== 'COACH' || !(await related(u.id, data.assignedClientId)))
        )
          throw new ApiError('forbidden', 403);
        if (data.id && !(await db.program.findFirst({ where: { id: data.id, ownerId: u.id } })))
          throw new ApiError('forbidden', 403);
        // The same exercise may appear more than once (e.g. a warm-up and a finisher).
        const { id: programId, exercises, ...rest } = data;
        result = await db.$transaction(async (tx) => {
          // Every catalog exercise is immediately usable, without a separate import step.
          for (const row of exercises) {
            const exercise = getFreeExercise(row.exerciseId);
            const available =
              exercise || (await tx.exercise.findUnique({ where: { id: row.exerciseId } }));
            if (!available || !hasExerciseAnimation(available))
              throw new ApiError('animationRequired', 400);
            if (exercise)
              await tx.exercise.upsert({
                where: { id: exercise.id },
                create: exercise,
                update: {},
              });
          }
          const previous = programId
            ? await tx.programExercise.findMany({ where: { programId } })
            : [];
          const program = programId
            ? await tx.program.update({ where: { id: programId }, data: rest })
            : await tx.program.create({ data: { ...rest, ownerId: u.id } });
          await tx.programExercise.deleteMany({ where: { programId: program.id } });
          await tx.programExercise.createMany({
            data: exercises.map((e, position) => ({ ...e, programId: program.id, position })),
          });
          // A workout already in progress follows the edited plan.
          if (programId) await syncLiveWorkouts(tx, program.id, program.name, previous, exercises);
          return program;
        });
        if (data.assignedClientId) await notify(data.assignedClientId, 'planUpdated');
        break;
      }
      case 'programs/assign': {
        const data = z.object({ id, assignedClientId: id }).parse(body);
        if (u.role !== 'COACH' || !(await related(u.id, data.assignedClientId)))
          throw new ApiError('forbidden', 403);
        const updated = await db.program.updateMany({
          where: { id: data.id, ownerId: u.id },
          data: { assignedClientId: data.assignedClientId },
        });
        if (!updated.count) throw new ApiError('forbidden', 403);
        await notify(data.assignedClientId, 'planUpdated');
        break;
      }
      case 'programs/schedule': {
        // Moves a workout between weekdays without rewriting its exercises.
        const data = z.object({ id, days: programDays }).parse(body);
        const program = await db.program.findFirst({ where: { id: data.id, ownerId: u.id } });
        if (!program) throw new ApiError('forbidden', 403);
        result = await db.program.update({ where: { id: program.id }, data: { days: data.days } });
        if (program.assignedClientId) await notify(program.assignedClientId, 'planUpdated');
        break;
      }
      case 'programs/duplicate': {
        // Copies a workout (or template) with every exercise setting, optionally re-scheduled
        // or assigned to a trainee so a template can be customised per client.
        const data = z
          .object({
            id,
            name: text.optional(),
            days: programDays.optional(),
            template: z.boolean().optional(),
            assignedClientId: id.nullable().optional(),
          })
          .parse(body);
        const source = await db.program.findFirst({
          where: { id: data.id, ownerId: u.id },
          include: { exercises: { orderBy: { position: 'asc' } } },
        });
        if (!source) throw new ApiError('forbidden', 403);
        if (
          data.assignedClientId &&
          (u.role !== 'COACH' || !(await related(u.id, data.assignedClientId)))
        )
          throw new ApiError('forbidden', 403);
        result = await db.program.create({
          data: {
            ownerId: u.id,
            name: data.name ?? source.name,
            description: source.description,
            weeks: source.weeks,
            days: data.days ?? source.days,
            template: data.template ?? source.template,
            assignedClientId: data.assignedClientId === undefined ? null : data.assignedClientId,
            exercises: {
              create: source.exercises.map((row, position) => ({
                exerciseId: row.exerciseId,
                position,
                sets: row.sets,
                reps: row.reps,
                repsMax: row.repsMax,
                rest: row.rest,
                weight: row.weight,
                notes: row.notes,
                group: row.group,
              })),
            },
          },
        });
        if (data.assignedClientId) await notify(data.assignedClientId, 'planUpdated');
        break;
      }
      case 'programs/delete': {
        const data = z.object({ id }).parse(body);
        const deleted = await db.program.deleteMany({ where: { id: data.id, ownerId: u.id } });
        if (!deleted.count) throw new ApiError('forbidden', 403);
        break;
      }
      case 'workouts/start': {
        if (u.role === 'COACH') throw new ApiError('forbidden', 403);
        const data = z.object({ programId: id }).parse(body);
        const p = await db.program.findUnique({
          where: { id: data.programId },
          include: { exercises: { include: { exercise: true }, orderBy: { position: 'asc' } } },
        });
        if (
          !p ||
          !(p.ownerId === u.id || (p.assignedClientId === u.id && (await related(p.ownerId, u.id))))
        )
          throw new ApiError('forbidden', 403);
        const animatedExercises = p.exercises.filter((row) => hasExerciseAnimation(row.exercise));
        if (!animatedExercises.length) throw new ApiError('animationRequired', 400);
        result = await db.$transaction(async (tx) => {
          const matching = await tx.workoutSession.findFirst({
            where: { userId: u.id, programId: p.id, status: { in: ['ACTIVE', 'PAUSED'] } },
            orderBy: { startedAt: 'desc' },
          });
          if (matching) return matching;
          const now = new Date();
          await pauseOtherWorkouts(tx, u.id, now);
          return tx.workoutSession.create({
            data: {
              userId: u.id,
              programId: p.id,
              name: p.name,
              startedAt: now,
              lastResumedAt: now,
              elapsedMilliseconds: 0,
              sets: {
                create: animatedExercises.flatMap((e) =>
                  Array.from({ length: e.sets }, (_, setIndex) => ({
                    exerciseId: e.exerciseId,
                    setIndex,
                    position: e.position,
                    restSeconds: e.rest,
                    reps: e.reps,
                    weight: e.weight,
                  })),
                ),
              },
            },
          });
        });
        break;
      }
      case 'workouts/update': {
        const data = z
          .object({
            id,
            status: z.enum(['ACTIVE', 'PAUSED', 'FINISHED']).optional(),
            notes: z.string().max(2000).optional(),
            rest: z.enum(['pause', 'resume', 'extend', 'reduce', 'skip', 'start']).optional(),
            restSetId: id.optional(),
            set: z
              .object({
                id,
                reps: z.number().int().min(0).max(100),
                weight: z.number().min(0).max(1000),
                completed: z.boolean(),
                rpe: z.number().min(1).max(10).nullable().optional(),
              })
              .optional(),
          })
          .parse(body);
        result = await db.$transaction(async (tx) => {
          const w = await tx.workoutSession.findFirst({ where: { id: data.id, userId: u.id } });
          if (
            !w ||
            (w.status === 'PAUSED' && (data.set || data.rest === 'start' || data.rest === 'resume'))
          )
            throw new ApiError('invalid');
          if (w.status === 'FINISHED') {
            if (data.status === 'FINISHED') return w;
            throw new ApiError('invalid');
          }
          const now = new Date();
          let restUntil = w.restUntil;
          let restRemaining = w.restRemaining;
          let personalRecord = false;
          if (data.set) {
            const { id: setId, ...values } = data.set;
            const set = await tx.workoutSet.findFirst({ where: { id: setId, sessionId: w.id } });
            if (!set) throw new ApiError('forbidden', 403);
            if (values.completed && !values.reps) throw new ApiError('invalid');
            const before = await tx.workoutSet.findMany({
              where: { sessionId: w.id, exerciseId: set.exerciseId },
            });
            await tx.workoutSet.update({ where: { id: setId }, data: values });
            if (values.completed)
              personalRecord = await recordLivePerformance(tx, w.id, u.id, set.exerciseId, before);
            // A changed weight or rep count carries over to the remaining sets of that exercise.
            const carried = {
              ...(values.weight !== set.weight ? { weight: values.weight } : {}),
              ...(values.reps !== set.reps && values.reps > 0 ? { reps: values.reps } : {}),
            };
            if (Object.keys(carried).length)
              await tx.workoutSet.updateMany({
                where: {
                  sessionId: w.id,
                  exerciseId: set.exerciseId,
                  position: set.position,
                  completed: false,
                  setIndex: { gt: set.setIndex },
                },
                data: carried,
              });
            if (values.completed && !set.completed) {
              restRemaining = 0;
              restUntil = set.restSeconds ? new Date(+now + set.restSeconds * 1000) : null;
            }
          }
          if (data.rest === 'start') {
            const set =
              data.restSetId &&
              (await tx.workoutSet.findFirst({ where: { id: data.restSetId, sessionId: w.id } }));
            if (!set) throw new ApiError('forbidden', 403);
            restRemaining = 0;
            restUntil = set.restSeconds ? new Date(+now + set.restSeconds * 1000) : null;
          }
          const seconds = restUntil
            ? Math.max(0, Math.ceil((+restUntil - +now) / 1000))
            : restRemaining;
          if (data.rest === 'pause' || data.status === 'PAUSED') {
            restRemaining = seconds;
            restUntil = null;
          }
          if ((data.rest === 'resume' || data.status === 'ACTIVE') && !restUntil && restRemaining) {
            restUntil = new Date(+now + restRemaining * 1000);
            restRemaining = 0;
          }
          if ((data.rest === 'extend' || data.rest === 'reduce') && seconds) {
            const next = Math.max(0, Math.min(900, seconds + (data.rest === 'extend' ? 15 : -15)));
            if (restUntil) restUntil = next ? new Date(+now + next * 1000) : null;
            else restRemaining = next;
          }
          if (data.rest === 'skip' || data.status === 'FINISHED') {
            restUntil = null;
            restRemaining = 0;
          }
          const changing = data.status && data.status !== w.status;
          if (changing && data.status === 'ACTIVE') await pauseOtherWorkouts(tx, u.id, now);
          const saved = await tx.workoutSession.update({
            where: { id: w.id },
            data: {
              status: data.status,
              notes: data.notes,
              restUntil,
              restRemaining,
              ...(changing ? workoutClockTransition(w, now) : {}),
              ...(data.status === 'FINISHED' ? { finishedAt: now } : {}),
            },
          });
          if (saved.finishedAt) await recordPerformance(tx, w.id, u.id, saved.finishedAt);
          return { ...saved, personalRecord };
        });
        break;
      }
      case 'meals/add': {
        if (u.role === 'COACH') throw new ApiError('forbidden', 403);
        const data = z
          .object({
            foodId: id,
            grams: positive,
            ...amount,
            meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
            date: day,
          })
          .parse(body);
        if (
          !(await db.food.findFirst({
            where: {
              id: data.foodId,
              ...foodAccess(u.id),
            },
          }))
        )
          throw new ApiError('forbidden', 403);
        result = await db.mealEntry.create({ data: { ...data, userId: u.id } });
        break;
      }
      case 'meals/photo': {
        // Logs a reviewed photo draft in one go. Catalog matches are logged as-is; AI
        // estimates become private foods (per 100 g) so the entry keeps its real grams.
        if (u.role === 'COACH') throw new ApiError('forbidden', 403);
        const macro = z.number().min(0).max(100);
        const input = z
          .object({
            meal: mealName,
            date: day,
            items: z
              .array(
                z.object({
                  foodId: id.nullable(),
                  nameEn: text,
                  nameHe: text,
                  grams: z.number().positive().max(2000),
                  per100: z.object({
                    calories: z.number().min(0).max(950),
                    protein: macro,
                    carbs: macro,
                    fat: macro,
                    fiber: macro,
                  }),
                }),
              )
              .min(1)
              .max(20),
          })
          .parse(body);
        const catalogIds = [
          ...new Set(input.items.flatMap((item) => (item.foodId ? [item.foodId] : []))),
        ];
        const allowed = await db.food.count({
          where: { id: { in: catalogIds }, ...foodAccess(u.id) },
        });
        if (allowed !== catalogIds.length) throw new ApiError('forbidden', 403);
        await db.$transaction(async (tx) => {
          for (const item of input.items) {
            const foodId =
              item.foodId ??
              (
                await tx.food.create({
                  data: {
                    nameEn: item.nameEn,
                    nameHe: item.nameHe,
                    ...item.per100,
                    ownerId: u.id,
                    source: 'ai-photo-estimate',
                  },
                })
              ).id;
            await tx.mealEntry.create({
              data: {
                userId: u.id,
                foodId,
                grams: item.grams,
                meal: input.meal,
                date: input.date,
              },
            });
          }
        });
        break;
      }
      case 'meals/delete': {
        if (u.role === 'COACH') throw new ApiError('forbidden', 403);
        const data = z.object({ id }).parse(body);
        await db.mealEntry.deleteMany({ where: { id: data.id, userId: u.id } });
        break;
      }
      case 'meals/copy': {
        if (u.role === 'COACH') throw new ApiError('forbidden', 403);
        const data = z.object({ from: day, to: day }).parse(body);
        if (data.from === data.to) throw new ApiError('invalid');
        await db.$transaction(async (tx) => {
          const meals = await tx.mealEntry.findMany({ where: { userId: u.id, date: data.from } });
          if (!meals.length) throw new ApiError('empty');
          const destination = await tx.mealEntry.findMany({
            where: { userId: u.id, date: data.to },
          });
          const signature = (m: (typeof meals)[number]) =>
            JSON.stringify([m.foodId, m.grams, m.meal, m.quantity, m.unitHe, m.unitEn]);
          const available = new Map<string, number>();
          for (const entry of destination)
            available.set(signature(entry), (available.get(signature(entry)) ?? 0) + 1);
          const missing = meals.filter((entry) => {
            const key = signature(entry),
              count = available.get(key) ?? 0;
            if (!count) return true;
            available.set(key, count - 1);
            return false;
          });
          await tx.mealEntry.createMany({
            data: missing.map((m) => ({
              userId: u.id,
              foodId: m.foodId,
              grams: m.grams,
              quantity: m.quantity,
              unitHe: m.unitHe,
              unitEn: m.unitEn,
              meal: m.meal,
              date: data.to,
            })),
          });
        });
        break;
      }
      case 'water': {
        if (u.role === 'COACH') throw new ApiError('forbidden', 403);
        const data = z.object({ ml: z.number().int().min(50).max(1000), date: day }).parse(body);
        await db.waterEntry.create({ data: { ...data, userId: u.id } });
        break;
      }
      case 'foods': {
        const data = z
          .object({
            nameEn: text,
            nameHe: text,
            calories: z.number().min(0).max(950),
            protein: z.number().min(0).max(100),
            carbs: z.number().min(0).max(100),
            fat: z.number().min(0).max(100),
            fiber: z.number().min(0).max(100),
          })
          .parse(body);
        await db.food.create({ data: { ...data, ownerId: u.id, source: 'user-estimate' } });
        break;
      }
      case 'profile/calorie-target': {
        // A linked coach may set the target for a client by passing userId.
        const input = z
          .object({
            calorieTarget: z.number().int().min(500).max(10000).nullable(),
            userId: id.optional(),
          })
          .parse(body);
        const owner = await authorizedTarget(u, input.userId);
        await db.profile.upsert({
          where: { userId: owner },
          create: { userId: owner, calorieTarget: input.calorieTarget },
          update: { calorieTarget: input.calorieTarget },
        });
        if (owner !== u.id) await notify(owner, 'targetsUpdated');
        break;
      }
      case 'profile/protein-target': {
        const input = z
          .object({
            proteinTarget: z.number().int().min(10).max(500).nullable(),
            userId: id.optional(),
          })
          .parse(body);
        const owner = await authorizedTarget(u, input.userId);
        await db.profile.upsert({
          where: { userId: owner },
          create: { userId: owner, proteinTarget: input.proteinTarget },
          update: { proteinTarget: input.proteinTarget },
        });
        if (owner !== u.id) await notify(owner, 'targetsUpdated');
        break;
      }
      case 'meals/quick': {
        // Log a food by name and totals only (no catalog search). It is saved as a private
        // food so it shows in the diary and counts toward the day's totals.
        if (u.role === 'COACH') throw new ApiError('forbidden', 403);
        const input = z
          .object({
            name: text,
            calories: z.number().min(0).max(10000),
            protein: z.number().min(0).max(1000).default(0),
            carbs: z.number().min(0).max(1000).default(0),
            fat: z.number().min(0).max(1000).default(0),
            meal: mealName,
            date: day,
          })
          .parse(body);
        // Foods are stored per 100 g (max 950 kcal / 100 g of each macro), so large
        // portions are spread over enough 100 g "servings" to stay within those bounds.
        const parts = Math.max(
          1,
          Math.ceil(input.calories / 950),
          ...[input.protein, input.carbs, input.fat].map((g) => Math.ceil(g / 100)),
        );
        await db.$transaction(async (tx) => {
          const food = await tx.food.create({
            data: {
              nameEn: input.name,
              nameHe: input.name,
              calories: input.calories / parts,
              protein: input.protein / parts,
              carbs: input.carbs / parts,
              fat: input.fat / parts,
              ownerId: u.id,
              source: 'user-estimate',
            },
          });
          await tx.mealEntry.create({
            data: {
              userId: u.id,
              foodId: food.id,
              grams: parts * 100,
              quantity: 1,
              unitHe: 'מנה',
              unitEn: 'serving',
              meal: input.meal,
              date: input.date,
            },
          });
        });
        break;
      }
      case 'meal-plans/log': {
        if (u.role === 'COACH') throw new ApiError('forbidden', 403);
        const input = z.object({ planId: id, date: day, meal: mealName.optional() }).parse(body);
        const plan = await db.mealPlan.findFirst({
          where: { id: input.planId, ...readablePlan(u.id) },
          include: { items: { orderBy: { position: 'asc' } } },
        });
        if (!plan || !plan.active || !menuApplies(plan, input.date))
          throw new ApiError('forbidden', 403);
        const items = plan.items.filter((item) => !input.meal || item.meal === input.meal);
        if (!items.length) throw new ApiError('empty');
        const logged = await db.$transaction(async (tx) => {
          const existing = await tx.mealEntry.findMany({
            where: {
              userId: u.id,
              date: input.date,
              planItemId: { in: items.map((item) => item.id) },
            },
            select: { planItemId: true },
          });
          const pending = items.filter(
            (item) => !existing.some((entry) => entry.planItemId === item.id),
          );
          await tx.mealEntry.createMany({
            data: pending.map((item) => ({
              userId: u.id,
              planItemId: item.id,
              foodId: item.foodId,
              grams: item.grams,
              quantity: item.quantity,
              unitHe: item.unitHe,
              unitEn: item.unitEn,
              meal: item.meal,
              date: input.date,
            })),
          });
          return pending.length;
        });
        result = { ok: true, logged };
        break;
      }
      case 'recipes': {
        const data = z
          .object({
            name: text,
            instructions: z.string().max(4000),
            servings: z.number().int().min(1).max(50),
            ingredients: z
              .array(z.object({ foodId: id, grams: positive }))
              .min(1)
              .max(30),
          })
          .parse(body);
        for (const ing of data.ingredients)
          if (
            !(await db.food.findFirst({
              where: { id: ing.foodId, ...foodAccess(u.id) },
            }))
          )
            throw new ApiError('forbidden', 403);
        const { ingredients, ...rest } = data;
        await db.recipe.create({
          data: { ...rest, userId: u.id, ingredients: { create: ingredients } },
        });
        break;
      }
      case 'meal-plans': {
        const data = z
          .object({
            id: id.optional(),
            name: text,
            content: z.string().trim().max(10000).default(''),
            items: z
              .array(
                z.object({
                  foodId: id,
                  grams: positive,
                  ...amount,
                  meal: mealName,
                }),
              )
              .max(80)
              .default([]),
            menuDate: day.nullable().optional(),
            menuWeekdays: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
            assignedClientId: id.nullable(),
          })
          .refine((plan) => !plan.menuDate || !plan.menuWeekdays?.length)
          .refine((plan) => plan.content.length > 0 || plan.items.length > 0, {
            message: 'planEmpty',
          })
          .transform(({ menuWeekdays, ...plan }) => ({
            ...plan,
            menuWeekdays: plan.menuDate ? null : serializeWeekdays(menuWeekdays),
          }))
          .parse(body);
        if (
          data.assignedClientId &&
          (u.role !== 'COACH' || !(await related(u.id, data.assignedClientId)))
        )
          throw new ApiError('forbidden', 403);
        const { id: planId, items, ...values } = data;
        const foodIds = [...new Set(items.map((item) => item.foodId))];
        const usable = await db.food.count({
          where: { id: { in: foodIds }, ...foodAccess(u.id) },
        });
        if (usable !== foodIds.length) throw new ApiError('forbidden', 403);
        await db.$transaction(async (tx) => {
          let savedId = planId;
          if (planId) {
            const updated = await tx.mealPlan.updateMany({
              where: { id: planId, userId: u.id },
              data: values,
            });
            if (!updated.count) throw new ApiError('forbidden', 403);
            await tx.mealPlanItem.deleteMany({ where: { planId } });
          } else {
            savedId = (await tx.mealPlan.create({ data: { ...values, userId: u.id } })).id;
          }
          if (items.length)
            await tx.mealPlanItem.createMany({
              data: items.map((item, position) => ({ ...item, position, planId: savedId! })),
            });
          if (values.assignedClientId)
            await tx.notification.create({
              data: { userId: values.assignedClientId, key: 'planUpdated' },
            });
        });
        break;
      }
      case 'meal-plans/eat': {
        // Ticks one food of an active plan as eaten: it becomes a normal diary entry
        // (so it counts toward the day's totals) linked back to the plan item.
        if (u.role === 'COACH') throw new ApiError('forbidden', 403);
        const input = z.object({ itemId: id, date: day, eaten: z.boolean() }).parse(body);
        await db.$transaction(async (tx) => {
          const item = await tx.mealPlanItem.findFirst({
            where: { id: input.itemId, plan: readablePlan(u.id) },
            include: { plan: true },
          });
          if (!item) throw new ApiError('forbidden', 403);
          const linked = { userId: u.id, date: input.date, planItemId: item.id };
          if (!input.eaten) {
            await tx.mealEntry.deleteMany({ where: linked });
            return;
          }
          if (!menuApplies(item.plan, input.date)) throw new ApiError('forbidden', 403);
          if (await tx.mealEntry.findFirst({ where: linked })) return;
          await tx.mealEntry.create({
            data: {
              ...linked,
              foodId: item.foodId,
              grams: item.grams,
              quantity: item.quantity,
              unitHe: item.unitHe,
              unitEn: item.unitEn,
              meal: item.meal,
            },
          });
        });
        break;
      }
      case 'meal-plans/active': {
        // Only the person who eats from the plan decides whether it is active:
        // the client for an assigned plan, otherwise the (non-coach) owner.
        if (u.role === 'COACH') throw new ApiError('forbidden', 403);
        const input = z.object({ id, active: z.boolean() }).parse(body);
        const updated = await db.mealPlan.updateMany({
          where: {
            id: input.id,
            OR: [
              { userId: u.id, assignedClientId: null },
              {
                assignedClientId: u.id,
                user: { coachLinks: { some: { clientId: u.id, status: 'ACTIVE' } } },
              },
            ],
          },
          data: { active: input.active },
        });
        if (!updated.count) throw new ApiError('forbidden', 403);
        break;
      }
      case 'meal-plans/delete': {
        const data = z.object({ id }).parse(body);
        // Items and checks cascade; only the owner may delete.
        const deleted = await db.mealPlan.deleteMany({ where: { id: data.id, userId: u.id } });
        if (!deleted.count) throw new ApiError('forbidden', 403);
        break;
      }
      case 'meal-plans/check': {
        if (u.role === 'COACH') throw new ApiError('forbidden', 403);
        const input = z
          .object({
            planId: id,
            date: day,
            completed: z.boolean(),
            meal: mealName.optional(),
          })
          .parse(body);
        await db.$transaction(async (tx) => {
          const plan = await tx.mealPlan.findFirst({
            where: {
              id: input.planId,
              OR: [
                { userId: u.id },
                {
                  assignedClientId: u.id,
                  user: { coachLinks: { some: { clientId: u.id, status: 'ACTIVE' } } },
                },
              ],
            },
          });
          if (!plan || !menuApplies(plan, input.date)) throw new ApiError('forbidden', 403);
          const key = { planId: plan.id, userId: u.id, date: input.date, meal: input.meal ?? '' };
          if (input.completed)
            await tx.mealPlanCheck.upsert({
              where: { planId_userId_date_meal: key },
              create: key,
              update: {},
            });
          else await tx.mealPlanCheck.deleteMany({ where: key });
        });
        break;
      }
      case 'progress/bodyweight': {
        const input = z
          .object({
            value: z.number().positive().max(700),
            date: day,
            note: z.string().max(1000).default(''),
            images: z.array(z.base64().max(95000)).max(3).default([]),
          })
          .parse(body);
        const images = await Promise.all(
          input.images.map((image) =>
            prepareProgressPhoto(image).catch(() => {
              throw new ApiError('photoError');
            }),
          ),
        );
        result = await db.$transaction(async (tx) => {
          const count = await tx.progressPhoto.count({ where: { userId: u.id } });
          if (count + images.length > 100) throw new ApiError('photoLimit');
          const record = await saveBodyweight(tx, u.id, input);
          for (const image of images) {
            await tx.progressPhoto.create({
              data: { userId: u.id, recordId: record.id, image: sealBytes(image) },
            });
          }
          return { id: record.id };
        });
        break;
      }
      case 'progress/photos': {
        const input = z.object({ image: z.base64().max(95000) }).parse(body);
        const image = await prepareProgressPhoto(input.image).catch(() => {
          throw new ApiError('photoError');
        });
        await db.$transaction(async (tx) => {
          if ((await tx.progressPhoto.count({ where: { userId: u.id } })) >= 100) {
            throw new ApiError('photoLimit');
          }
          await tx.progressPhoto.create({ data: { userId: u.id, image: sealBytes(image) } });
        });
        break;
      }
      case 'progress/photos/delete': {
        const data = z.object({ id }).parse(body);
        const deleted = await db.progressPhoto.deleteMany({ where: { id: data.id, userId: u.id } });
        if (!deleted.count) throw new ApiError('notFound', 404);
        break;
      }
      case 'progress': {
        const data = z
          .object({
            kind: z.enum(['energy', 'sleep', 'distance', 'measurement', 'weight']),
            value: z.number().min(0).max(10000),
            unit: z.enum(['score', 'hours', 'km', 'cm', 'mi', 'in', 'kg']),
            date: day,
            note: z.string().max(1000),
          })
          .refine(
            (entry) =>
              entry.kind !== 'weight' ||
              (entry.unit === 'kg' && entry.value > 0 && entry.value <= 700),
          )
          .parse(body);
        if (data.kind === 'weight') {
          await db.$transaction((tx) => saveBodyweight(tx, u.id, data));
        } else {
          await db.progressRecord.create({ data: { ...data, userId: u.id } });
        }
        break;
      }
      case 'clients/check-schedule': {
        if (u.role !== 'COACH') throw new ApiError('forbidden', 403);
        const input = z.object({ clientId: id.optional() }).parse(body);
        if (input.clientId) {
          await authorizedTarget(u, input.clientId);
          if (input.clientId === u.id) throw new ApiError('forbidden', 403);
        }
        const clients = await db.coachRelationship.findMany({
          where: { coachId: u.id, status: 'ACTIVE', clientId: input.clientId },
          select: { clientId: true },
        });
        for (const { clientId } of clients) {
          const summary = await clientAdherence(db, u.id, clientId);
          const latest = summary.missed.sort((a, b) => b.date.localeCompare(a.date))[0];
          if (latest) {
            const noticeId = tokenHash(
              `missed:${u.id}:${clientId}:${latest.programId}:${latest.date}`,
            );
            await db.notification.upsert({
              where: { id: noticeId },
              create: { id: noticeId, key: 'clientMissed', detail: clientId, userId: u.id },
              update: {},
            });
          }
          if (input.clientId) result = summary;
        }
        break;
      }
      case 'clients/invite': {
        if (u.role !== 'COACH') throw new ApiError('forbidden', 403);
        const { email } = z.object({ email: z.email() }).parse(body);
        const client = await db.user.findUnique({ where: { email: email.toLowerCase() } });
        if (!client || client.id === u.id || client.role === 'ADMIN')
          throw new ApiError('clientNotFound', 404);
        if (u.coachStatus !== 'APPROVED') throw new ApiError('coachNotApproved', 403);
        const capacity = clientCapacity(u.role, u.subscription, paymentsConfigured(), {
          coachStatus: u.coachStatus,
          coachClientLimit: u.coachClientLimit,
          grants: await activeGrantKinds(u.id),
          rules: planRules(await getConfig()),
        });
        await db.$transaction(async (tx) => {
          const existing = await tx.coachRelationship.findUnique({
            where: { coachId_clientId: { coachId: u.id, clientId: client.id } },
          });
          if (existing && ['ACTIVE', 'PENDING'].includes(existing.status)) return;
          const count = await tx.coachRelationship.count({
            where: { coachId: u.id, status: { in: ['ACTIVE', 'PENDING'] } },
          });
          if (count >= capacity)
            throw new ApiError(
              paymentsConfigured() && count === 0 ? 'coachPlanRequired' : 'capacity',
              403,
            );
          await tx.coachRelationship.upsert({
            where: { coachId_clientId: { coachId: u.id, clientId: client.id } },
            create: { coachId: u.id, clientId: client.id },
            update: { status: 'PENDING' },
          });
          const profile = await tx.profile.findUnique({ where: { userId: client.id } });
          if (profile?.reminders !== false)
            await tx.notification.create({ data: { userId: client.id, key: 'coachInvite' } });
        });
        break;
      }
      case 'clients/respond': {
        const data = z.object({ id, accept: z.boolean() }).parse(body);
        const link = await db.coachRelationship.findFirst({
          where: { id: data.id, clientId: u.id, status: 'PENDING' },
        });
        if (!link) throw new ApiError('forbidden', 403);
        await db.coachRelationship.update({
          where: { id: link.id },
          data: { status: data.accept ? 'ACTIVE' : 'DECLINED' },
        });
        break;
      }
      case 'clients/update': {
        const data = z
          .object({ id, notes: z.string().max(5000), tags: z.string().max(300) })
          .parse(body);
        const link = await db.coachRelationship.findFirst({
          where: { id: data.id, coachId: u.id, status: 'ACTIVE' },
        });
        if (!link) throw new ApiError('forbidden', 403);
        await db.coachRelationship.update({
          where: { id: link.id },
          data: { notes: data.notes, tags: data.tags },
        });
        break;
      }
      case 'clients/revoke': {
        const { id: linkId } = z.object({ id }).parse(body);
        const count = await db.coachRelationship.updateMany({
          where: { id: linkId, OR: [{ coachId: u.id }, { clientId: u.id }] },
          data: { status: 'REVOKED' },
        });
        if (!count.count) throw new ApiError('forbidden', 403);
        break;
      }
      case 'appointments': {
        const data = z
          .object({
            title: text,
            kind: z.enum(['MEETING', 'PERSONAL_TRAINING']).default('MEETING'),
            notes: z.string().trim().max(2000).default(''),
            guestId: id.nullable(),
            startsAt: z.iso.datetime(),
            duration: z.number().int().min(15).max(180),
          })
          .parse(body);
        if (
          data.guestId &&
          !((await related(u.id, data.guestId)) || (await related(data.guestId, u.id)))
        )
          throw new ApiError('forbidden', 403);
        const startsAt = new Date(data.startsAt),
          endsAt = new Date(startsAt.getTime() + data.duration * 60000);
        if (startsAt < new Date()) throw new ApiError('past');
        result = await db.$transaction(async (tx) => {
          const ids = [u.id, ...(data.guestId ? [data.guestId] : [])];
          const conflict = await tx.appointment.findFirst({
            where: {
              status: 'BOOKED',
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
              OR: [{ ownerId: { in: ids } }, { guestId: { in: ids } }],
            },
          });
          if (conflict) throw new ApiError('conflict', 409);
          return tx.appointment.create({
            data: {
              ownerId: u.id,
              guestId: data.guestId,
              title: data.title,
              kind: data.kind,
              notes: data.notes,
              startsAt,
              endsAt,
            },
          });
        });
        if (data.guestId) await notify(data.guestId, 'appointmentBooked');
        break;
      }
      case 'appointments/update': {
        const data = z
          .object({
            id,
            status: z.enum(['CANCELLED', 'ATTENDED']),
            notes: z.string().max(2000).optional(),
          })
          .parse(body);
        const a = await db.appointment.findUnique({ where: { id: data.id } });
        if (
          !a ||
          (a.ownerId !== u.id && a.guestId !== u.id) ||
          (data.status === 'ATTENDED' && a.ownerId !== u.id)
        )
          throw new ApiError('forbidden', 403);
        await db.appointment.update({
          where: { id: a.id },
          data: { status: data.status, notes: data.notes },
        });
        const otherId = a.ownerId === u.id ? a.guestId : a.ownerId;
        if (otherId) await notify(otherId, 'appointmentUpdated');
        break;
      }
      case 'messages': {
        const data = z
          .object({ recipientId: id, body: z.string().trim().min(1).max(4000) })
          .parse(body);
        if (!(await related(u.id, data.recipientId)) && !(await related(data.recipientId, u.id)))
          throw new ApiError('forbidden', 403);
        await db.message.create({ data: { ...data, senderId: u.id } });
        break;
      }
      case 'messages/read': {
        const data = z.object({ senderId: id }).parse(body);
        await db.message.updateMany({
          where: { recipientId: u.id, senderId: data.senderId, readAt: null },
          data: { readAt: new Date() },
        });
        break;
      }
      case 'notifications/read':
        await db.notification.updateMany({ where: { userId: u.id }, data: { read: true } });
        break;
      case 'branding': {
        if (u.role !== 'COACH') throw new ApiError('forbidden', 403);
        const data = z
          .object({
            businessName: text,
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            welcome: z.string().max(1000),
          })
          .parse(body);
        await db.branding.upsert({
          where: { userId: u.id },
          create: { userId: u.id, ...data },
          update: data,
        });
        break;
      }
      case 'branding/logo': {
        if (u.role !== 'COACH') throw new ApiError('forbidden', 403);
        const input = z.object({ image: z.base64().max(95000) }).parse(body);
        const image = await prepareBrandLogo(input.image).catch(() => {
          throw new ApiError('photoError');
        });
        await db.$transaction([
          db.brandLogo.upsert({
            where: { userId: u.id },
            create: { userId: u.id, image },
            update: { image },
          }),
          db.branding.upsert({
            where: { userId: u.id },
            create: { userId: u.id, businessName: u.name, logoAt: new Date() },
            update: { logoAt: new Date() },
          }),
        ]);
        break;
      }
      case 'branding/logo/delete': {
        if (u.role !== 'COACH') throw new ApiError('forbidden', 403);
        await db.$transaction([
          db.brandLogo.deleteMany({ where: { userId: u.id } }),
          db.branding.updateMany({ where: { userId: u.id }, data: { logoAt: null } }),
        ]);
        break;
      }
      case 'branding/background': {
        if (u.role !== 'COACH') throw new ApiError('forbidden', 403);
        const input = z.object({ image: z.base64().max(290000) }).parse(body);
        const image = await prepareBrandBackground(input.image).catch(() => {
          throw new ApiError('photoError');
        });
        await db.$transaction([
          db.brandBackground.upsert({
            where: { userId: u.id },
            create: { userId: u.id, image },
            update: { image },
          }),
          db.branding.upsert({
            where: { userId: u.id },
            create: { userId: u.id, businessName: u.name, backgroundAt: new Date() },
            update: { backgroundAt: new Date() },
          }),
        ]);
        break;
      }
      case 'branding/background/delete': {
        if (u.role !== 'COACH') throw new ApiError('forbidden', 403);
        await db.$transaction([
          db.brandBackground.deleteMany({ where: { userId: u.id } }),
          db.branding.updateMany({ where: { userId: u.id }, data: { backgroundAt: null } }),
        ]);
        break;
      }
      case 'ai': {
        const { prompt, mode } = z
          .object({
            prompt: z.string().trim().min(1).max(3000),
            mode: z.enum(['fitness', 'nutrition', 'copilot']),
          })
          .parse(body);
        if (!u.profile?.adult || !u.profile.aiConsent) throw new ApiError('consent', 403);
        if (mode === 'copilot' && u.role !== 'COACH') throw new ApiError('forbidden', 403);
        if (!(await planAccess(u)).ai) throw new ApiError('aiPlanRequired', 403);
        if (!(await aiConfigured())) throw new ApiError('aiUnavailable', 503);
        await assertAiAllowed(u.id, mode === 'copilot' ? 'copilot' : 'chat');
        await rateLimit(`ai:${u.id}`, 5);
        const answer = await aiContext
          .run({ userId: u.id, feature: mode === 'copilot' ? 'copilot' : 'chat' }, () =>
            chat(
              [
                {
                  role: 'system',
                  content: `You are Fitura+, a general ${mode} assistant. Reply in ${u.language === 'he' ? 'Hebrew' : 'English'}. ${AI_SAFETY} Never claim you changed any records. Do not request identifying health data.`,
                },
                { role: 'user', content: prompt },
              ],
              1500,
            ),
          )
          .catch(() => {
            throw new ApiError('aiUnavailable', 503);
          });
        await db.aIInteraction.create({ data: { userId: u.id, prompt, response: answer } });
        result = { answer };
        break;
      }
      case 'ai/photo': {
        // Recognizes the foods in a meal photo and returns an unsaved draft; the user
        // reviews portions and logs it through meals/photo. The photo itself is not stored.
        if (u.role === 'COACH') throw new ApiError('forbidden', 403);
        const input = z
          .object({
            image: z.base64().max(95000),
            note: z.string().trim().max(300).default(''),
          })
          .parse(body);
        if (!u.profile?.adult || !u.profile.aiConsent) throw new ApiError('consent', 403);
        if (!(await planAccess(u)).ai) throw new ApiError('aiPlanRequired', 403);
        if (!(await aiConfigured())) throw new ApiError('aiUnavailable', 503);
        await assertAiAllowed(u.id, 'photo');
        await rateLimit(`ai:${u.id}`, 5);
        const jpeg = await prepareProgressPhoto(input.image).catch(() => {
          throw new ApiError('photoError');
        });
        const lang = u.language === 'he' ? 'he' : 'en';
        const draft = await aiContext
          .run({ userId: u.id, feature: 'photo' }, () =>
            recognizeMeal(db, u.id, jpeg, lang, input.note),
          )
          .catch((error) => {
            if (error instanceof AiUnavailable)
              throw new ApiError(error.keyRejected ? 'aiKeyRejected' : 'aiPhotoFailed', 503);
            throw error;
          });
        await db.aIInteraction.create({
          data: {
            userId: u.id,
            prompt: `[photo] ${input.note}`.trim(),
            response: JSON.stringify(draft).slice(0, 10000),
          },
        });
        result = { draft };
        break;
      }
      case 'ai/plan': {
        // Returns an unsaved draft built only from the app's own exercise and food catalog.
        // The user reviews it and saves through programs/save or meal-plans.
        const input = z
          .object({
            kind: z.enum(['workout', 'menu']),
            prompt: z.string().trim().min(1).max(2000),
            clientId: id.nullable().optional(),
          })
          .parse(body);
        if (!u.profile?.adult || !u.profile.aiConsent) throw new ApiError('consent', 403);
        if (!(await planAccess(u)).ai) throw new ApiError('aiPlanRequired', 403);
        if (!(await aiConfigured())) throw new ApiError('aiUnavailable', 503);
        await assertAiAllowed(u.id, 'plan');
        if (input.clientId && (u.role !== 'COACH' || !(await related(u.id, input.clientId))))
          throw new ApiError('forbidden', 403);
        await rateLimit(`ai:${u.id}`, 5);
        // Plans are shaped by whoever will follow them; a coach's own profile has no fitness data.
        // A client's profile (goals, limitations, diet) goes to the AI provider only when that
        // client is an adult who has turned on AI features themselves; otherwise the coach
        // gets a generic draft built from the prompt alone.
        const clientProfile = input.clientId
          ? await db.profile.findUnique({ where: { userId: input.clientId } })
          : null;
        const profile = input.clientId
          ? clientProfile?.adult && clientProfile.aiConsent
            ? clientProfile
            : null
          : u.role === 'COACH'
            ? null
            : u.profile;
        const lang = u.language === 'he' ? 'he' : 'en';
        const draft = await aiContext
          .run({ userId: u.id, feature: 'plan' }, () =>
            input.kind === 'workout'
              ? draftWorkout(input.prompt, profile, lang)
              : draftMenu(db, u.id, input.prompt, profile, lang),
          )
          .catch((error) => {
            if (error instanceof AiUnavailable)
              throw new ApiError(error.keyRejected ? 'aiKeyRejected' : 'aiPlanFailed', 503);
            throw error;
          });
        await db.aIInteraction.create({
          data: {
            userId: u.id,
            prompt: `[${input.kind}] ${input.prompt}`,
            response: JSON.stringify(draft).slice(0, 10000),
          },
        });
        result = { kind: input.kind, draft };
        break;
      }
      case 'account/reset': {
        const { password } = z
          .object({
            password: z.string().min(1).max(128),
            confirmed: z.literal(true),
          })
          .parse(body);
        if (!verifyPassword(password, u.passwordHash)) throw new ApiError('credentials', 401);
        if (isDemoEmail(u.email)) throw new ApiError('demoProtected', 403);
        await db.$transaction(async (tx) => {
          await tx.workoutSession.deleteMany({ where: { userId: u.id } });
          await tx.exercisePerformance.deleteMany({ where: { userId: u.id } });
          await tx.program.deleteMany({ where: { ownerId: u.id } });
          await tx.program.updateMany({
            where: { assignedClientId: u.id },
            data: { assignedClientId: null },
          });
          await tx.mealEntry.deleteMany({ where: { userId: u.id } });
          await tx.waterEntry.deleteMany({ where: { userId: u.id } });
          await tx.recipe.deleteMany({ where: { userId: u.id } });
          await tx.mealPlanCheck.deleteMany({ where: { userId: u.id } });
          await tx.mealPlan.deleteMany({ where: { userId: u.id } });
          await tx.mealPlan.updateMany({
            where: { assignedClientId: u.id },
            data: { assignedClientId: null },
          });
          // Preserve foods referenced by other people's diaries or recipes.
          await tx.food.deleteMany({
            where: {
              ownerId: u.id,
              meals: { none: {} },
              ingredients: { none: {} },
              planItems: { none: {} },
            },
          });
          await tx.food.updateMany({
            where: { ownerId: u.id },
            data: { ownerId: null, source: 'private-retained' },
          });
          await tx.progressPhoto.deleteMany({ where: { userId: u.id } });
          await tx.progressRecord.deleteMany({ where: { userId: u.id } });
          await tx.cardioActivity.deleteMany({ where: { userId: u.id } });
          await tx.dailySteps.deleteMany({ where: { userId: u.id } });
          await tx.appointment.deleteMany({
            where: { OR: [{ ownerId: u.id }, { guestId: u.id }] },
          });
          await tx.message.deleteMany({
            where: { OR: [{ senderId: u.id }, { recipientId: u.id }] },
          });
          await tx.coachRelationship.deleteMany({
            where: { OR: [{ coachId: u.id }, { clientId: u.id }] },
          });
          await tx.notification.deleteMany({ where: { userId: u.id } });
          await tx.aIInteraction.deleteMany({ where: { userId: u.id } });
          await tx.branding.deleteMany({ where: { userId: u.id } });
          await tx.brandLogo.deleteMany({ where: { userId: u.id } });
          await tx.brandBackground.deleteMany({ where: { userId: u.id } });
          await tx.profile.deleteMany({ where: { userId: u.id } });
          await tx.profile.create({ data: { userId: u.id } });
          await tx.auditLog.create({ data: { actorId: u.id, action: 'account/reset' } });
        });
        break;
      }
      case 'account/delete': {
        const { password } = z.object({ password: z.string().max(128) }).parse(body);
        if (u.subscription?.providerId && u.subscription.status === 'ACTIVE')
          throw new ApiError('subscriptionActive', 409);
        if (!verifyPassword(password, u.passwordHash)) throw new ApiError('credentials', 401);
        if (isDemoEmail(u.email)) throw new ApiError('demoProtected', 403);
        await db.$transaction((tx) => deleteAccountData(tx, u));
        await signOut();
        break;
      }
      case 'admin/flag': {
        if (u.role !== 'ADMIN') throw new ApiError('forbidden', 403);
        const data = z.object({ key: z.enum(['marketplace']), enabled: z.boolean() }).parse(body);
        await db.featureFlag.upsert({
          where: { key: data.key },
          create: data,
          update: { enabled: data.enabled },
        });
        break;
      }
      default:
        throw new ApiError('notFound', 404);
    }
    if (!['account/delete', 'account/reset', 'clients/check-schedule'].includes(path))
      await audit(u.id, path);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    if (error instanceof ApiError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (['P2002', 'P2034'].includes(error.code))
        return NextResponse.json({ error: 'conflict' }, { status: 409 });
      if (['P2003', 'P2025'].includes(error.code))
        return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    console.error(
      JSON.stringify({ event: 'api_error', type: error instanceof Error ? error.name : 'unknown' }),
    );
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
