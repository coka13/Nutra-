import { expect, test } from '@playwright/test';
import { sessionScript } from '../../mobile/src/session-script';

for (const language of ['en', 'he'] as const) {
  test(`separate sign-up, logout and portal restoration in ${language}`, async ({ page }) => {
    test.setTimeout(60_000);
    const he = language === 'he';
    const password = 'Portal-Auth-Test-492!';
    const suffix = Date.now();
    const emails = {
      user: `portal-user-${suffix}@example.test`,
      coach: `portal-coach-${suffix}@example.test`,
    };
    const auth = () => page.request.get('/api/auth/me').then((response) => response.json());
    let userId = '';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/auth');
    if (he) await page.getByRole('button', { name: 'Language' }).click();
    try {
      for (const kind of ['user', 'coach'] as const) {
        await expect(page.locator('html')).toHaveAttribute('dir', he ? 'rtl' : 'ltr');
        await page.locator(`.account-choice[href="/auth/${kind}/login"]`).click();
        await expect(page).toHaveURL('/auth/' + kind + '/login', { timeout: 15_000 });
        await expect(page.locator('html')).toHaveAttribute('dir', he ? 'rtl' : 'ltr');
        await page.locator(`.auth-bottom a[href="/auth/${kind}/register"]`).click();
        await page.locator('[name=name]').fill(kind === 'user' ? 'Portal User' : 'Portal Coach');
        await page.locator('[name=email]').fill(emails[kind]);
        await page.locator('[name=password]').fill(password);
        if (kind === 'coach') await page.locator('[name=phone]').fill('+972501234567');
        await page.locator('[name=acceptTerms]').check();
  await page.locator('[name=healthConsent]').check();
        await page.locator('form button').click();
        await expect(page).toHaveURL(/\/app(?:\/onboarding)?$/);
        const { user } = await auth();
        expect(user.role).toBe(kind === 'user' ? 'INDEPENDENT' : 'COACH');
        if (kind === 'user') {
          userId = user.id;
          await page.goto('/app');
          await expect(
            page.getByRole('heading', { name: he ? /בואו נעשה/ : /Let’s make today count/ }),
          ).toBeVisible();
          expect((await page.request.get('/api/coach/active-workouts')).status()).toBe(403);
          await expect(
            page
              .locator('.sidebar')
              .getByRole('button', { name: he ? 'מתאמנים' : 'Clients', exact: true }),
          ).toHaveCount(0);
          expect(
            (
              await page.request.post('/api/auth/coach/login', {
                data: { email: emails.user, password },
              })
            ).status(),
          ).toBe(401);
          await page.request.post('/api/auth/logout', { data: {} });
          expect((await auth()).user).toBeNull();
          await page.goto('/auth');
        } else {
          const dashboard = page.getByRole('heading', {
            name: he ? 'לוח הבקרה למאמנים' : 'Coach dashboard',
          });
          await expect(dashboard).toBeVisible();
          await expect(
            page
              .locator('.sidebar')
              .getByRole('button', { name: he ? 'מתאמנים' : 'Clients', exact: true }),
          ).toHaveCount(1);
          await page.reload();
          await expect(dashboard).toBeVisible();
          expect((await page.request.get(`/api/state?userId=${userId}`)).status()).toBe(403);
          expect(
            (
              await page.request.post('/api/auth/user/login', {
                data: { email: emails.coach, password },
              })
            ).status(),
          ).toBe(401);
          expect(
            (
              await page.request.post('/api/auth/coach/register', {
                data: {
                  email: emails.user,
                  acceptTerms: true,
                  healthConsent: true,
                  password,
                  name: 'Duplicate',
                  phone: '+972501234567',
                },
              })
            ).status(),
          ).toBe(409);
          expect(
            (await page.request.post('/api/clients/invite', { data: { email: emails.user } })).ok(),
          ).toBeTruthy();
        }
      }
    } finally {
      for (const kind of ['coach', 'user'] as const) {
        const signedIn = await page.request.post(`/api/auth/${kind}/login`, {
          data: { email: emails[kind], password },
        });
        if (signedIn.ok()) await page.request.post('/api/account/delete', { data: { password } });
      }
    }
  });
}

test('native session bridge registers, restores and signs out with the same cookie jar', async ({
  page,
  context,
}) => {
  const messages: { type: string; user?: { role: string } | null }[] = [];
  const email = `bridge-${Date.now()}@example.test`;
  const password = 'Cookie-Bridge-Test29!';
  await context.exposeBinding('captureNutri', (_source, value: string) => {
    messages.push(JSON.parse(value));
  });
  await context.addInitScript(() => {
    const host = window as unknown as {
      captureNutri: (value: string) => void;
      ReactNativeWebView: { postMessage: (data: string) => void };
    };
    host.ReactNativeWebView = { postMessage: (data) => host.captureNutri(data) };
  });
  async function bootstrap() {
    messages.length = 0;
    await page.goto('/phone-session');
    await page.evaluate(sessionScript);
    await expect.poll(() => messages.find((result) => result.type === 'session')).toBeDefined();
    return messages.find((result) => result.type === 'session')?.user;
  }
  try {
    expect(await bootstrap()).toBeNull();
    await page.evaluate(
      ({ email, password }) => {
        const bridge = window as unknown as {
          nutriAuth: (id: number, path: string, values: unknown) => void;
        };
        void bridge.nutriAuth(1, 'coach/register', {
          email,
          password,
          name: 'Bridge Coach',
          phone: '+972501234567',
          language: 'he',
        });
      },
      { email, password },
    );
    await expect(page).toHaveURL(/\/app$/);
    expect((await bootstrap())?.role).toBe('COACH');
    await page.request.post('/api/auth/logout', { data: {} });
    expect(await bootstrap()).toBeNull();
  } finally {
    const signedIn = await page.request.post('/api/auth/coach/login', {
      data: { email, password },
    });
    if (signedIn.ok()) await page.request.post('/api/account/delete', { data: { password } });
  }
});
