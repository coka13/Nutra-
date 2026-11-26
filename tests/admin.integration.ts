/**
 * Administration console: authentication, authorization and behaviour against a running server.
 * The server and this process must share DATABASE_URL and ADMIN_ENCRYPTION_KEY.
 *   TEST_URL=http://localhost:3000 npm run test:admin
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { encryptSecret, generateTotpSecret, totpAt, totpStep } from '../src/lib/admin/crypto';
import { hashPassword } from '../src/lib/security';

try {
  // Same DATABASE_URL / ADMIN_ENCRYPTION_KEY as the server under test.
  process.loadEnvFile();
} catch {
  /* Variables may come from the environment. */
}

const base = process.env.TEST_URL || 'http://localhost:3000';
const db = new PrismaClient();
after(() => db.$disconnect());
const suffix = Date.now().toString(36);
const PASSWORD = 'Admin-Test-Password-9x';

type Res = { status: number; data: Record<string, unknown>; text: string };
class Client {
  cookies = new Map<string, string>();
  async raw(url: string, init: RequestInit = {}) {
    const response = await fetch(base + url, {
      ...init,
      redirect: 'manual',
      headers: {
        ...(init.headers as Record<string, string>),
        ...(this.cookies.size && {
          Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        }),
      },
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const [name, ...value] = pair.split('=');
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value.join('='));
    }
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text);
    } catch {
      /* CSV or HTML */
    }
    return { status: response.status, data, text } satisfies Res;
  }
  console(path: string, body?: unknown, csrf = true) {
    return this.raw(
      `/api/console/${path}`,
      body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(csrf && { 'x-nutra-admin': '1' }) },
            body: JSON.stringify(body),
          },
    );
  }
  app(path: string, body?: unknown) {
    return this.raw(
      `/api/${path}`,
      body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
    );
  }
}

async function makeAdmin(role: string, label: string) {
  const secret = generateTotpSecret();
  const admin = await db.adminAccount.create({
    data: {
      email: `${label}-${suffix}@admin.test`,
      name: label,
      role,
      passwordHash: hashPassword(PASSWORD),
      totpSecret: encryptSecret(secret),
      totpEnabledAt: new Date(),
      status: 'ACTIVE',
    },
  });
  return { ...admin, secret };
}
async function signIn(admin: { email: string; secret: string }) {
  const c = new Client();
  const login = await c.console('auth/login', { email: admin.email, password: PASSWORD });
  assert.equal(login.status, 200, login.text);
  const mfa = await c.console('auth/mfa', {
    challenge: login.data.challenge,
    code: totpAt(admin.secret, totpStep()),
  });
  assert.equal(mfa.status, 200, mfa.text);
  return c;
}
async function appUser(role: 'INDEPENDENT' | 'COACH' = 'INDEPENDENT', label = 'user') {
  const c = new Client();
  const email = `${label}-${suffix}-${Math.random().toString(36).slice(2, 6)}@example.test`;
  const r = await c.app('auth/register', {
    name: label,
    email,
    acceptTerms: true,
    password: 'TestOnly-LongPassword!',
    role,
    language: 'en',
    ...(role === 'COACH' && { phone: '+972501234567' }),
  });
  assert.equal(r.status, 200, r.text);
  return { client: c, id: (r.data.user as { id: string }).id, email };
}

test('the console rejects anonymous, app-user and cross-site requests', async () => {
  const anon = new Client();
  assert.equal((await anon.console('dashboard')).status, 401);
  assert.equal((await anon.console('users')).status, 401);
  assert.equal((await anon.console('does/not/exist')).status, 404);
  const { client: user } = await appUser();
  // An app session never authenticates the console.
  assert.equal((await user.console('dashboard')).status, 401);
  assert.equal((await user.console('users/export')).status, 401);
  // Mutations without the anti-CSRF header are refused before anything else.
  assert.equal(
    (await anon.console('auth/login', { email: 'x@y.z', password: 'x' }, false)).status,
    403,
  );
  const foreign = await anon.raw('/api/console/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-nutra-admin': '1',
      Origin: 'https://evil.example',
    },
    body: '{}',
  });
  assert.equal(foreign.status, 403);
  // Pages are server-gated too.
  const page = await anon.raw('/admin/users');
  assert.ok([302, 303, 307, 308].includes(page.status), String(page.status));
  const robots = await anon.raw('/admin/login');
  assert.equal(robots.status, 200);
  assert.match(robots.text, /noindex/);
});

test('sign-in needs the password and a TOTP code, rejects replays and locks after failures', async () => {
  const admin = await makeAdmin('SUPPORT_ADMIN', 'login');
  const c = new Client();
  const bad = await c.console('auth/login', { email: admin.email, password: 'wrong-password-123' });
  assert.equal(bad.status, 401);
  assert.equal(bad.data.error, 'credentials');
  const login = await c.console('auth/login', { email: admin.email, password: PASSWORD });
  assert.equal(login.status, 200);
  assert.equal(login.data.next, 'mfa');
  assert.equal(
    (await c.console('dashboard')).status,
    401,
    'password alone does not create a session',
  );
  assert.equal(
    (await c.console('auth/mfa', { challenge: login.data.challenge, code: '000000' })).status,
    401,
  );
  const code = totpAt(admin.secret, totpStep());
  const ok = await c.console('auth/mfa', { challenge: login.data.challenge, code });
  assert.equal(ok.status, 200, ok.text);
  assert.equal((ok.data.admin as { role: string }).role, 'SUPPORT_ADMIN');
  assert.equal((await c.console('auth/me')).status, 200);
  // Challenges are single use and codes cannot be replayed.
  assert.equal(
    (await new Client().console('auth/mfa', { challenge: login.data.challenge, code })).status,
    401,
  );
  const again = await new Client().console('auth/login', {
    email: admin.email,
    password: PASSWORD,
  });
  assert.equal(
    (await new Client().console('auth/mfa', { challenge: again.data.challenge, code })).status,
    401,
  );
  // Lockout.
  const victim = await makeAdmin('SUPPORT_ADMIN', 'lockout');
  let last: Res | null = null;
  for (let i = 0; i < 5; i++)
    last = await c.console('auth/login', { email: victim.email, password: 'nope-nope-nope-1' });
  assert.equal(last!.status, 423);
  assert.equal(
    (await new Client().console('auth/login', { email: victim.email, password: PASSWORD })).status,
    429,
    'rate limit or lock blocks further tries',
  );
  const row = await db.adminAccount.findUniqueOrThrow({ where: { id: victim.id } });
  assert.ok(row.lockedUntil && row.lockedUntil > new Date());
  // Signing out ends the session server-side.
  assert.equal((await c.console('auth/logout', {})).status, 200);
  assert.equal((await c.console('auth/me')).status, 401);
});

test('role permissions are enforced server-side and refusals are audited', async () => {
  const content = await signIn(await makeAdmin('CONTENT_MANAGER', 'content'));
  assert.equal((await content.console('users')).status, 403);
  assert.equal((await content.console('billing')).status, 403);
  assert.equal((await content.console('admins')).status, 403);
  assert.equal(
    (
      await content.console('admins', {
        email: `x-${suffix}@a.test`,
        name: 'X',
        role: 'SUPER_ADMIN',
      })
    ).status,
    403,
    'no self-service escalation',
  );
  assert.equal((await content.console('content/items?type=FAQ')).status, 200);
  const finance = await signIn(await makeAdmin('FINANCE_ADMIN', 'finance'));
  assert.equal((await finance.console('config')).status, 403);
  assert.equal((await finance.console('billing')).status, 200);
  const me = await content.console('auth/me');
  const denied = await db.adminAuditLog.findFirst({
    where: { adminId: (me.data.admin as { id: string }).id, result: 'DENIED' },
  });
  assert.ok(denied, 'denied attempt recorded');
});

test('idle, expired and disabled sessions are rejected', async () => {
  const idle = await makeAdmin('SUPPORT_ADMIN', 'idle');
  const c = await signIn(idle);
  assert.equal((await c.console('users')).status, 200);
  await db.adminSession.updateMany({
    where: { adminId: idle.id },
    data: { lastSeenAt: new Date(Date.now() - 31 * 60000) },
  });
  assert.equal((await c.console('users')).status, 401);
  assert.equal(
    await db.adminSession.count({ where: { adminId: idle.id } }),
    0,
    'idle session deleted',
  );
  const expired = await makeAdmin('SUPPORT_ADMIN', 'expired');
  const e = await signIn(expired);
  await db.adminSession.updateMany({
    where: { adminId: expired.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal((await e.console('users')).status, 401);
  const disabled = await makeAdmin('SUPPORT_ADMIN', 'disabled');
  const d = await signIn(disabled);
  await db.adminAccount.update({ where: { id: disabled.id }, data: { status: 'DISABLED' } });
  assert.equal((await d.console('users')).status, 401);
});

test('sensitive operations require a fresh second factor', async () => {
  const admin = await makeAdmin('SUPER_ADMIN', 'stepup');
  const c = await signIn(admin);
  const target = await appUser('INDEPENDENT', 'delete-me');
  await db.adminSession.updateMany({
    where: { adminId: admin.id },
    data: { reauthAt: new Date(Date.now() - 3600000) },
  });
  const blocked = await c.console(`users/${target.id}/delete`, { confirmEmail: target.email });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.error, 'stepUpRequired');
  assert.equal((await c.console('users/export')).data.error, 'stepUpRequired');
  assert.equal((await c.console('auth/step-up', { code: '123456' })).status, 401);
  const step = await c.console('auth/step-up', { code: totpAt(admin.secret, totpStep() + 1) });
  assert.equal(step.status, 200, step.text);
  assert.equal(
    (await c.console(`users/${target.id}/delete`, { confirmEmail: 'wrong@example.test' })).status,
    400,
  );
  assert.equal(
    (await c.console(`users/${target.id}/delete`, { confirmEmail: target.email })).status,
    200,
  );
  assert.equal(await db.user.count({ where: { id: target.id } }), 0);
  const csv = await c.console('users/export?role=COACH');
  assert.equal(csv.status, 200);
  assert.match(csv.text, /^﻿?id,name,email,role/);
  assert.ok(!/passwordHash|scrypt/.test(csv.text));
});

test('account actions apply immediately in the app and cannot grant admin roles', async () => {
  const c = await signIn(await makeAdmin('SUPER_ADMIN', 'manage'));
  const user = await appUser('INDEPENDENT', 'managed');
  const detail = await c.console(`users/${user.id}`);
  assert.equal(detail.status, 200);
  const shown = JSON.stringify(detail.data);
  assert.ok(
    !shown.includes('passwordHash') &&
      !shown.includes('limitations') &&
      !shown.includes('heightCm'),
    'no secrets or health data',
  );
  // Suspension signs the user out and blocks sign-in.
  assert.equal(
    (await c.console(`users/${user.id}/status`, { status: 'SUSPENDED', reason: 'test' })).status,
    200,
  );
  assert.equal((await user.client.app('state')).status, 401);
  const login = await new Client().app('auth/login', {
    email: user.email,
    password: 'TestOnly-LongPassword!',
  });
  assert.equal(login.status, 403);
  assert.equal(login.data.error, 'accountSuspended');
  assert.equal((await c.console(`users/${user.id}/status`, { status: 'ACTIVE' })).status, 200);
  const relog = new Client();
  assert.equal(
    (await relog.app('auth/login', { email: user.email, password: 'TestOnly-LongPassword!' }))
      .status,
    200,
  );
  // Complimentary access changes entitlements on the next state load.
  const before = await relog.app('state');
  assert.equal((before.data.entitlements as { ads: boolean }).ads, true);
  const grant = await c.console(`users/${user.id}/grants`, {
    kind: 'PREMIUM',
    days: 7,
    reason: 'Support goodwill',
  });
  assert.equal(grant.status, 200, grant.text);
  const after = await relog.app('state');
  assert.deepEqual(after.data.entitlements, {
    plan: 'PREMIUM',
    ai: false,
    ads: false,
    clientLimit: 0,
  });
  const grantId = (grant.data.grant as { id: string }).id;
  assert.equal((await c.console(`users/${user.id}/grants/${grantId}/revoke`, {})).status, 200);
  assert.equal(((await relog.app('state')).data.entitlements as { plan: string }).plan, 'FREE');
  // Roles: never ADMIN.
  assert.equal((await c.console(`users/${user.id}/role`, { role: 'ADMIN' })).status, 400);
  assert.equal((await c.console(`users/${user.id}/role`, { role: 'SUPER_ADMIN' })).status, 400);
});

test('coach approval gates client invitations and revocation removes client access', async () => {
  const c = await signIn(await makeAdmin('SUPPORT_ADMIN', 'coaches'));
  const coach = await appUser('COACH', 'coach');
  const client = await appUser('INDEPENDENT', 'client');
  assert.equal((await c.console(`coaches/${coach.id}/status`, { status: 'PENDING' })).status, 200);
  const invite = await coach.client.app('clients/invite', { email: client.email });
  assert.equal(invite.status, 403);
  assert.equal(invite.data.error, 'coachNotApproved');
  assert.equal((await c.console(`coaches/${coach.id}/status`, { status: 'APPROVED' })).status, 200);
  assert.equal((await coach.client.app('clients/invite', { email: client.email })).status, 200);
  assert.equal((await c.console(`coaches/${coach.id}/limit`, { limit: 3 })).status, 200);
  const list = await c.console(`coaches?q=${encodeURIComponent(coach.email)}`);
  assert.equal((list.data.items as { clientLimit: number }[])[0].clientLimit, 3);
  assert.equal((await c.console(`coaches/${coach.id}/status`, { status: 'REVOKED' })).status, 200);
  assert.equal(
    await db.coachRelationship.count({
      where: { coachId: coach.id, status: { in: ['ACTIVE', 'PENDING'] } },
    }),
    0,
  );
});

test('dashboard figures match the database', async () => {
  const c = await signIn(await makeAdmin('FINANCE_ADMIN', 'dash'));
  const r = await c.console('dashboard');
  assert.equal(r.status, 200, r.text);
  const totals = r.data.totals as { users: number; coaches: number; trainees: number };
  assert.equal(totals.users, await db.user.count({ where: { role: { not: 'ADMIN' } } }));
  assert.equal(totals.coaches, await db.user.count({ where: { role: 'COACH' } }));
  assert.equal(totals.trainees, await db.user.count({ where: { role: 'INDEPENDENT' } }));
  assert.ok(Array.isArray(r.data.series) && (r.data.series as unknown[]).length >= 28);
  assert.ok(r.data.revenue, 'finance sees revenue');
  const support = await signIn(await makeAdmin('SUPPORT_ADMIN', 'dash2'));
  assert.equal(
    (await support.console('dashboard')).data.revenue,
    null,
    'support does not see revenue',
  );
});

test('remote configuration is versioned, drives maintenance mode and rolls back', async () => {
  const c = await signIn(await makeAdmin('TECHNICAL_ADMIN', 'config'));
  const { data } = await c.console('config');
  const current = data.config as Record<string, unknown>;
  assert.equal(
    (current.maintenance as { enabled: boolean }).enabled,
    false,
    'test starts outside maintenance',
  );
  const user = await appUser('INDEPENDENT', 'maint');
  const publish = await c.console('config', {
    features: current.features,
    app: current.app,
    maintenance: { enabled: true, messageEn: 'Back soon', messageHe: 'נחזור בקרוב' },
    note: 'maintenance test',
    baseVersion: data.version,
  });
  assert.equal(publish.status, 200, publish.text);
  try {
    const blocked = await user.client.app('state');
    assert.equal(blocked.status, 503);
    assert.equal(blocked.data.error, 'maintenance');
    assert.equal((await user.client.app('auth/me')).status, 200);
    const stale = await c.console('config', {
      features: current.features,
      app: current.app,
      maintenance: current.maintenance,
      note: 'stale',
      baseVersion: data.version,
    });
    assert.equal(stale.status, 409, 'optimistic concurrency');
  } finally {
    if (data.version) {
      const rollback = await c.console('config/rollback', { version: data.version });
      assert.equal(rollback.status, 200, rollback.text);
    } else {
      // No earlier version to roll back to: publish the previous values again.
      const restore = await c.console('config', {
        features: current.features,
        app: current.app,
        maintenance: current.maintenance,
        note: 'restore',
        baseVersion: publish.data.version,
      });
      assert.equal(restore.status, 200, restore.text);
    }
  }
  assert.equal((await user.client.app('state')).status, 200);
  const pub = await new Client().app('config?appVersion=0.0.1');
  assert.equal(pub.status, 200);
  assert.ok(!pub.text.includes('stripePriceIds') && !pub.text.includes('monthlyBudgetUsd'));
  // Invalid configuration is refused.
  const latest = await c.console('config');
  const bad = await c.console('config', {
    features: current.features,
    maintenance: current.maintenance,
    app: { ...(current.app as object), minimumVersion: 'one' },
    note: 'bad',
    baseVersion: latest.data.version,
  });
  assert.equal(bad.status, 400);
});

test('AI provider keys are write-only and never returned', async () => {
  const admin = await makeAdmin('TECHNICAL_ADMIN', 'ai');
  const c = await signIn(admin);
  const key = `sk-test-${suffix}-SECRETVALUE`;
  const save = await c.console('ai/providers/groq', {
    enabled: false,
    textModel: 'llama-3.3-70b-versatile',
    visionModel: '',
    inputCostPerM: 0.5,
    outputCostPerM: 0.8,
    apiKey: key,
  });
  assert.equal(save.status, 200, save.text);
  assert.ok(!save.text.includes('SECRETVALUE'));
  const view = await c.console('ai');
  assert.ok(!view.text.includes('SECRETVALUE'));
  const row = await db.aIProvider.findUniqueOrThrow({ where: { id: 'groq' } });
  assert.ok(row.encryptedKey && !row.encryptedKey.includes('SECRETVALUE'));
  const audit = await db.adminAuditLog.findMany({ where: { adminId: admin.id } });
  assert.ok(
    audit.every((a) => !a.details.includes('SECRETVALUE')),
    'audit log redacts keys',
  );
  await c.console('ai/providers/groq', {
    enabled: false,
    textModel: 'llama-3.3-70b-versatile',
    visionModel: '',
    inputCostPerM: 0.5,
    outputCostPerM: 0.8,
    clearKey: true,
  });
});

test('announcements require a matching preview and reach only the target audience', async () => {
  const c = await signIn(await makeAdmin('CONTENT_MANAGER', 'notify'));
  const target = await appUser('INDEPENDENT', 'target');
  const other = await appUser('INDEPENDENT', 'other');
  const preview = await c.console('announcements/preview', {
    audience: 'USERS',
    userIds: [target.id],
  });
  assert.equal(preview.data.recipients, 1);
  const body = {
    titleEn: 'Hello',
    titleHe: 'שלום',
    bodyEn: 'News',
    bodyHe: 'חדשות',
    audience: 'USERS',
    userIds: [target.id],
    inApp: true,
    push: false,
    mode: 'now',
  };
  assert.equal(
    (await c.console('announcements', { ...body, confirm: true, expectedRecipients: 5 })).status,
    409,
  );
  assert.equal(
    (await c.console('announcements', { ...body })).status,
    409,
    'unconfirmed mass send',
  );
  const sent = await c.console('announcements', { ...body, confirm: true, expectedRecipients: 1 });
  assert.equal(sent.status, 200, sent.text);
  assert.equal((sent.data.announcement as { status: string }).status, 'SENT');
  const state = await target.client.app('state');
  const id = (sent.data.announcement as { id: string }).id;
  assert.ok(
    (state.data.notifications as { key: string; detail: string }[]).some(
      (n) => n.key === 'announcement' && n.detail === id,
    ),
  );
  assert.ok((state.data.announcements as { id: string }[]).some((a) => a.id === id));
  const otherState = await other.client.app('state');
  assert.ok(!(otherState.data.notifications as { detail: string }[]).some((n) => n.detail === id));
});

test('support tickets flow both ways and internal notes stay private', async () => {
  const c = await signIn(await makeAdmin('SUPPORT_ADMIN', 'support'));
  const user = await appUser('INDEPENDENT', 'ticket');
  const created = await user.client.app('support', {
    action: 'create',
    category: 'BUG',
    subject: 'Timer stops',
    body: 'The rest timer stops when locked.',
  });
  assert.equal(created.status, 200, created.text);
  const ticketId = (created.data.ticket as { id: string }).id;
  assert.equal(
    (
      await c.console(`tickets/${ticketId}/reply`, {
        body: 'Internal: reproduce on iOS',
        internal: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await c.console(`tickets/${ticketId}/reply`, { body: 'Thanks, we are on it.' })).status,
    200,
  );
  assert.equal(
    (await c.console(`tickets/${ticketId}`, { priority: 'HIGH', status: 'IN_PROGRESS' })).status,
    200,
  );
  const mine = await user.client.app('support');
  const ticket = (
    mine.data.tickets as { id: string; status: string; messages: { body: string }[] }[]
  ).find((t) => t.id === ticketId)!;
  assert.ok(ticket.messages.some((m) => m.body === 'Thanks, we are on it.'));
  assert.ok(!mine.text.includes('Internal: reproduce'));
  // Another user cannot reply to it.
  const stranger = await appUser('INDEPENDENT', 'stranger');
  assert.equal(
    (await stranger.client.app('support', { action: 'reply', ticketId, body: 'hi' })).status,
    404,
  );
});

test('the audit log is append-only at the database level', async () => {
  const row = await db.adminAuditLog.findFirst();
  assert.ok(row);
  await assert.rejects(
    db.adminAuditLog.update({ where: { id: row.id }, data: { action: 'tampered' } }),
  );
  await assert.rejects(db.adminAuditLog.delete({ where: { id: row.id } }));
});

test('administrators are managed only by Super Admins and the last one is protected', async () => {
  const superAdmin = await makeAdmin('SUPER_ADMIN', 'owner');
  const c = await signIn(superAdmin);
  const invite = await c.console('admins', {
    email: `invitee-${suffix}@admin.test`,
    name: 'Invitee',
    role: 'FINANCE_ADMIN',
  });
  assert.equal(invite.status, 200, invite.text);
  const token = new URL(invite.data.inviteUrl as string).searchParams.get('token')!;
  const info = await new Client().console(`auth/invite?token=${token}`);
  assert.equal(info.status, 200);
  assert.equal(
    (await new Client().console('auth/invite', { token, password: 'short', code: '123456' }))
      .status,
    400,
  );
  assert.equal(
    (
      await new Client().console('auth/invite', {
        token,
        password: 'Strong-Password-12345',
        code: totpAt(info.data.secret as string, totpStep()),
      })
    ).status,
    200,
  );
  assert.equal(
    (await new Client().console(`auth/invite?token=${token}`)).status,
    400,
    'invite is single-use',
  );
  const me = (await c.console('auth/me')).data.admin as { id: string };
  assert.equal(
    (await c.console(`admins/${me.id}`, { role: 'SUPPORT_ADMIN' })).status,
    409,
    'cannot demote self',
  );
});

test('scheduled jobs require the cron secret', async () => {
  assert.equal((await new Client().raw('/api/jobs/run', { method: 'POST' })).status, 404);
  if (!process.env.CRON_SECRET) return;
  const r = await new Client().raw('/api/jobs/run?job=cleanup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal((r.data.results as { status: string }[])[0].status, 'SUCCESS');
});

test('the public health check reports database status', async () => {
  const r = await new Client().raw('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'ok');
});
