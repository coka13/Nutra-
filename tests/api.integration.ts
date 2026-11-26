import { test } from 'node:test';
import assert from 'node:assert/strict';
const base = process.env.TEST_URL || 'http://localhost:3000';
type Result = { status: number; data: Record<string, unknown> };
class Client {
  cookie = '';
  async request(path: string, body?: unknown): Promise<Result> {
    const r = await fetch(`${base}/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const cookie = r.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';')[0];
    return { status: r.status, data: await r.json() };
  }
}
test('end-to-end API access, persistence, nutrition, coaching, scheduling and integration gates', async () => {
  const suffix = Date.now(),
    password = 'TestOnly-LongPassword!';
  const a = new Client(),
    b = new Client(),
    coach = new Client(),
    anon = new Client();
  const emailA = `api-a-${suffix}@example.test`,
    emailB = `api-b-${suffix}@example.test`,
    emailC = `api-c-${suffix}@example.test`;
  assert.equal((await anon.request('state')).status, 401);
  assert.equal((await anon.request('billing/checkout', { tier: 'PREMIUM' })).status, 401);
  if (!process.env.STRIPE_SECRET_KEY)
    assert.equal((await anon.request('webhooks/stripe', {})).status, 503);
  assert.equal(
    (
      await anon.request('auth/register', {
        name: 'Escalation',
        email: `admin-${suffix}@example.test`,
        acceptTerms: true,
        password,
        role: 'ADMIN',
      })
    ).status,
    400,
  );
  const noTerms = await anon.request('auth/register', {
    name: 'No consent',
    email: `no-terms-${suffix}@example.test`,
    password,
    role: 'INDEPENDENT',
  });
  assert.equal(noTerms.status, 400);
  assert.equal(noTerms.data.error, 'termsRequired');
  async function register(c: Client, email: string, role = 'INDEPENDENT') {
    const r = await c.request('auth/register', {
      name: email,
      email,
      acceptTerms: true,
      password,
      role,
      ...(role === 'COACH' && { phone: '+972501234567' }),
      language: 'en',
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return (r.data.user as { id: string }).id;
  }
  const aId = await register(a, emailA),
    bId = await register(b, emailB),
    coachId = await register(coach, emailC, 'COACH');
  try {
    assert.equal(
      (await anon.request('auth/login', { email: emailA, password: 'wrong' })).status,
      401,
    );
    assert.equal((await a.request('admin')).status, 403);
    if (!process.env.STRIPE_SECRET_KEY)
      assert.equal((await a.request('billing/checkout', { tier: 'PREMIUM' })).status, 503);
    assert.equal((await b.request(`state?userId=${aId}`)).status, 403);
    assert.equal((await b.request(`performance?userId=${aId}`)).status, 403);
    assert.equal((await b.request(`progress/photos?userId=${aId}`)).status, 403);
    assert.equal((await anon.request('auth/coach-login', { email: emailA, password })).status, 401);
    assert.equal(
      (await coach.request('auth/coach-login', { email: emailC, password })).status,
      200,
    );
    const profile = {
      name: 'Test user',
      language: 'he',
      theme: 'dark',
      goal: 'strength',
      experience: 'beginner',
      equipment: 'bodyweight',
      frequency: 3,
      duration: 30,
      dietary: '',
      limitations: '',
      units: 'metric',
      timezone: 'Asia/Jerusalem',
      adult: true,
      aiConsent: false,
      reminders: true,
      onboarded: true,
    };
    assert.equal((await a.request('profile', profile)).status, 200);
    assert.equal((await a.request('programs/generate', {})).status, 200);
    const saved = await a.request('programs/save', {
      name: 'API routine',
      description: 'test',
      weeks: 4,
      days: '1,3,5',
      exercises: [{ exerciseId: 'squat', sets: 2, reps: 8, rest: 60, weight: 0, group: '' }],
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const programId = String(saved.data.id);
    assert.equal((await b.request('programs/delete', { id: programId })).status, 403);
    assert.equal((await b.request('workouts/start', { programId })).status, 403);
    const start = await a.request('workouts/start', { programId });
    assert.equal(start.status, 200);
    const workoutId = String(start.data.id);
    const state = (await a.request('state')).data;
    const workouts = state.workouts as { id: string; sets: { id: string }[] }[];
    const set = workouts.find((w) => w.id === workoutId)!.sets[0];
    assert.equal(
      (
        await a.request('workouts/update', {
          id: workoutId,
          set: { id: set.id, reps: 12, weight: 5, rpe: 8.5, completed: true },
        })
      ).status,
      200,
    );
    const pausedRest = await a.request('workouts/update', { id: workoutId, rest: 'pause' });
    assert.equal(pausedRest.status, 200);
    assert.equal(pausedRest.data.restUntil, null);
    assert.ok(Number(pausedRest.data.restRemaining) > 0);
    const extendedRest = await a.request('workouts/update', { id: workoutId, rest: 'extend' });
    assert.equal(
      Number(extendedRest.data.restRemaining),
      Number(pausedRest.data.restRemaining) + 30,
    );
    const resumedRest = await a.request('workouts/update', { id: workoutId, rest: 'resume' });
    assert.ok(Date.parse(String(resumedRest.data.restUntil)) > Date.now());
    assert.equal(
      (await a.request('workouts/update', { id: workoutId, status: 'PAUSED' })).status,
      200,
    );
    assert.equal(
      (
        await a.request('workouts/update', {
          id: workoutId,
          set: { id: set.id, reps: 12, weight: 5, completed: false },
        })
      ).status,
      400,
    );
    assert.equal(
      (await a.request('workouts/update', { id: workoutId, status: 'ACTIVE' })).status,
      200,
    );
    const persisted = (await a.request('state')).data.workouts as {
      id: string;
      sets: { completed: boolean; weight: number }[];
    }[];
    assert.equal(persisted.find((w) => w.id === workoutId)!.sets[0].weight, 5);
    assert.equal(
      (await b.request('workouts/update', { id: workoutId, status: 'FINISHED' })).status,
      400,
    );
    assert.equal(
      (await a.request('workouts/update', { id: workoutId, status: 'FINISHED' })).status,
      200,
    );
    assert.equal(
      (await a.request('workouts/update', { id: workoutId, status: 'FINISHED' })).status,
      200,
    );
    const performance = await a.request('performance?exerciseId=squat');
    assert.equal(performance.status, 200);
    assert.equal((performance.data.history as unknown[]).length, 1);
    assert.deepEqual((performance.data.records as { _max: unknown }[])[0]._max, {
      weight: 5,
      reps: 12,
      estimate: 7,
      volume: 60,
    });
    const date = '2026-11-21';
    assert.equal(
      (await a.request('meals/add', { foodId: 'oats', grams: 60, meal: 'breakfast', date })).status,
      200,
    );
    assert.equal(
      (await a.request('meals/add', { foodId: 'oats', grams: -1, meal: 'breakfast', date })).status,
      400,
    );
    assert.equal(
      (
        await a.request('meals/add', {
          foodId: 'oats',
          grams: 100,
          meal: 'breakfast',
          date: '2026-02-31',
        })
      ).status,
      400,
    );
    assert.equal(((await a.request(`state?date=${date}`)).data.meals as unknown[]).length, 1);
    assert.equal((await a.request('water', { ml: 250, date })).status, 200);
    assert.equal(
      (
        await a.request('progress', {
          kind: 'energy',
          value: 7,
          unit: 'score',
          date,
          note: 'Feeling good',
        })
      ).status,
      200,
    );
    assert.equal((await coach.request('clients/invite', { email: emailA })).status, 200);
    assert.equal((await coach.request(`state?userId=${aId}`)).status, 403);
    const links = (await a.request('state')).data.relationships as {
      id: string;
      coachId: string;
    }[];
    const link = links.find((r) => r.coachId === coachId)!;
    assert.equal((await a.request('clients/respond', { id: link.id, accept: true })).status, 200);
    assert.equal((await coach.request(`state?userId=${aId}`)).status, 200);
    assert.equal((await coach.request(`state?userId=${bId}`)).status, 403);
    const coachProgram = await coach.request('programs/save', {
      name: 'Assignment regression',
      days: '1,3,5',
      exercises: [{ exerciseId: 'squat', sets: 2, reps: 8, rest: 60, weight: 0, group: '' }],
    });
    assert.equal(coachProgram.status, 200);
    const assignedId = String(coachProgram.data.id);
    const beforeAssignment = (await coach.request('state')).data.programs as { id: string }[];
    assert.equal(
      (await a.request('programs/assign', { id: assignedId, assignedClientId: aId })).status,
      403,
    );
    assert.equal(
      (await coach.request('programs/assign', { id: programId, assignedClientId: aId })).status,
      403,
    );
    assert.equal(
      (await coach.request('programs/assign', { id: assignedId, assignedClientId: bId })).status,
      403,
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal(
        (await coach.request('programs/assign', { id: assignedId, assignedClientId: aId })).status,
        200,
      );
    }
    const afterAssignment = (await coach.request('state')).data.programs as {
      id: string;
      assignedClientId: string | null;
      exercises: { sets: number; reps: number }[];
    }[];
    assert.equal(afterAssignment.length, beforeAssignment.length);
    const assignedProgram = afterAssignment.find((program) => program.id === assignedId)!;
    assert.equal(assignedProgram.assignedClientId, aId);
    assert.equal(assignedProgram.exercises.length, 1);
    assert.equal(assignedProgram.exercises[0].sets, 2);
    assert.equal(assignedProgram.exercises[0].reps, 8);
    assert.ok(
      ((await a.request('state')).data.programs as { id: string }[]).some(
        (program) => program.id === assignedId,
      ),
    );
    assert.equal(
      (await coach.request('messages', { recipientId: aId, body: 'Hello from your coach' })).status,
      200,
    );
    assert.equal(
      (await b.request('messages', { recipientId: aId, body: 'Unauthorized' })).status,
      403,
    );
    const startsAt = new Date(Date.now() + 86400000).toISOString();
    const booking = await coach.request('appointments', {
      title: 'Test appointment',
      guestId: aId,
      startsAt,
      duration: 45,
    });
    assert.equal(booking.status, 200);
    assert.equal(
      (
        await a.request('appointments', {
          title: 'Conflict',
          guestId: coachId,
          startsAt,
          duration: 30,
        })
      ).status,
      409,
    );
    assert.equal(
      (await coach.request('appointments/update', { id: booking.data.id, status: 'CANCELLED' }))
        .status,
      200,
    );
    assert.equal(
      (
        await a.request('appointments', {
          title: 'Freed slot',
          guestId: coachId,
          startsAt,
          duration: 30,
        })
      ).status,
      200,
    );
    assert.equal(
      (await a.request('ai', { mode: 'fitness', prompt: 'Help me plan a week' })).status,
      403,
    );
    assert.equal((await a.request('profile', { ...profile, aiConsent: true })).status, 200);
    const integrations = (await a.request('state')).data.integrations as { ai: boolean };
    if (!integrations.ai)
      assert.equal(
        (await a.request('ai', { mode: 'fitness', prompt: 'Help me plan a week' })).status,
        503,
      );
    assert.equal((await a.request('clients/revoke', { id: link.id })).status, 200);
    // Without a coach, the free plan has no AI.
    assert.equal(
      (await a.request('ai', { mode: 'fitness', prompt: 'Help me plan a week' })).status,
      403,
    );
    assert.equal((await coach.request(`state?userId=${aId}`)).status, 403);
    assert.equal(
      (await coach.request('messages', { recipientId: aId, body: 'After revoke' })).status,
      403,
    );
    const exported = await a.request('export');
    assert.equal(exported.status, 200);
    assert.equal((exported.data.user as { id: string }).id, aId);
    assert(!JSON.stringify(exported.data).includes('passwordHash'));
    const csrf = await fetch(`${base}/api/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: a.cookie,
        Origin: 'https://malicious.invalid',
      },
      body: JSON.stringify({ theme: 'light' }),
    });
    assert.equal(csrf.status, 403);
  } finally {
    for (const c of [a, b, coach]) {
      const r = await c.request('account/delete', { password });
      assert.equal(r.status, 200, JSON.stringify(r.data));
    }
  }
});
