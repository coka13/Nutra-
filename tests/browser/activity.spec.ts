import { expect, test } from '@playwright/test';

test('health imports are idempotent, private and exportable', async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const password = 'Activity-Test-2026!';
  const day = '2026-11-21';
  try {
    for (const [index, context] of [first, second].entries()) {
      const response = await context.request.post('/api/auth/register', {
        data: {
          name: 'Activity Test',
          email: `activity-${Date.now()}-${index}@example.test`,
          acceptTerms: true,
          healthConsent: true,
          password,
          role: 'INDEPENDENT',
          language: 'en',
        },
      });
      expect(response.ok()).toBeTruthy();
    }
    const snapshot = {
      action: 'sync',
      source: 'apple-health',
      date: day,
      steps: 4321,
      activities: [
        { externalId: 'health-workout-1', date: day, kind: 'running', minutes: 25, distanceKm: 4 },
      ],
    };
    for (let iteration = 0; iteration < 2; iteration++)
      expect((await first.request.post('/api/activity', { data: snapshot })).ok()).toBeTruthy();
    let data = await (await first.request.get('/api/activity?date=' + day)).json();
    expect(data.steps.steps).toBe(4321);
    expect(data.activities).toHaveLength(1);
    const other = await (await second.request.get('/api/activity?date=' + day)).json();
    expect(other.steps).toBeNull();
    expect(other.activities).toHaveLength(0);
    await second.request.post('/api/activity', {
      data: { action: 'delete', id: data.activities[0].id },
    });
    expect(
      (await (await first.request.get('/api/activity?date=' + day)).json()).activities,
    ).toHaveLength(1);
    expect(
      (
        await first.request.post('/api/activity', {
          data: snapshot,
          headers: { Origin: 'https://foreign.example' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await first.request.post('/api/activity', { data: { ...snapshot, steps: -1 } })).status(),
    ).toBe(400);
    expect(
      (
        await first.request.post('/api/activity', {
          data: { ...snapshot, expectedUserId: 'another-account' },
        })
      ).status(),
    ).toBe(403);
    const exported = await (await first.request.get('/api/export')).json();
    expect(exported.dailySteps[0].steps).toBe(4321);
    expect(exported.cardioActivities).toHaveLength(1);
    await first.request.post('/api/activity', { data: { action: 'disconnect' } });
    data = await (await first.request.get('/api/activity?date=' + day)).json();
    expect(data.steps).toBeNull();
    expect(data.activities).toHaveLength(0);
  } finally {
    for (const context of [first, second]) {
      await context.request.post('/api/account/delete', { data: { password } });
      await context.close();
    }
  }
});

for (const language of ['en', 'he'])
  test(`mobile activity logging and full catalog in ${language}`, async ({ page }) => {
    const he = language === 'he';
    const password = 'Aerobic-Test-2026!';
    // Reproduce phone WebViews loading the development server over LAN HTTP.
    await page.addInitScript(() => {
      Object.defineProperty(window.crypto, 'randomUUID', { configurable: true, value: undefined });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      (
        await page.request.post('/api/auth/register', {
          data: {
            name: 'Aerobic Test',
            email: `aerobic-${language}-${Date.now()}@example.test`,
            acceptTerms: true,
            healthConsent: true,
            password,
            role: 'INDEPENDENT',
            language,
          },
        })
      ).ok(),
    ).toBeTruthy();
    try {
      await page.goto('/app/activity');
      await expect(
        page.getByRole('heading', { name: he ? 'צעדים ופעילות' : 'Steps & activity' }),
      ).toBeVisible();
      await expect(page.locator('input[name=minutes]')).toHaveCount(0);
      const date = new Intl.DateTimeFormat('en-CA').format(new Date());
      expect(
        (
          await page.request.post('/api/activity', {
            data: {
              action: 'sync',
              source: he ? 'health-connect' : 'apple-health',
              date,
              steps: 1000,
              activities: [{ externalId: 'walking-test', date, kind: 'walking', minutes: 35 }],
            },
          })
        ).ok(),
      ).toBeTruthy();
      await page.reload();
      await expect(page.locator('.activity-log-row')).toHaveCount(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
      await page.request.post('/api/preferences', { data: { theme: 'dark' } });
      await page.addInitScript(
        (source) => {
          (
            window as Window & { ReactNativeWebView?: { postMessage: (value: string) => void } }
          ).ReactNativeWebView = {
            postMessage: (value) => {
              const message = JSON.parse(value);
              if (message.type !== 'health-sync') return;
              setTimeout(
                () =>
                  window.dispatchEvent(
                    new CustomEvent('nutra-health-result', {
                      detail: {
                        requestId: message.requestId,
                        userId: message.userId,
                        snapshot: {
                          source,
                          date: message.date,
                          steps: 5400,
                          activities: [],
                        },
                      },
                    }),
                  ),
                20,
              );
            },
          };
        },
        he ? 'health-connect' : 'apple-health',
      );
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      const sync = page.getByRole('button', {
        name: he ? 'סנכרון נתוני כושר' : 'Sync fitness data',
      });
      await expect(sync).toBeDisabled();
      await page.getByRole('checkbox').check();
      await sync.click();
      await expect(page.locator('.activity-summary')).toContainText('5,400');
      await sync.click();
      await expect(page.locator('.activity-summary')).toContainText('5,400');
      await page.screenshot({ path: `test-results/activity-${language}-dark.png`, fullPage: true });
      await page.route('**/api/exercise-catalog?**', (route) =>
        route.fulfill({
          json: {
            total: 876,
            offset: Number(new URL(route.request().url()).searchParams.get('offset')),
            limit: 10,
            results: [
              {
                id: 'fe_Walking',
                nameEn: 'Walking',
                nameHe: 'Walking',
                muscle: 'cardio',
                equipment: 'bodyweight',
                difficulty: 'beginner',
                instructionsEn: 'Walk steadily.',
                instructionsHe: 'Walk steadily.',
              },
            ],
          },
        }),
      );
      await page.goto('/app/library');
      await page.locator('.catalog-search').fill('walking');
      await expect(page.locator('.catalog-card')).toHaveCount(1);
      await expect(page.locator('.catalog-card')).toContainText('Walking');
      await page.getByRole('button', { name: he ? 'עמוד הבא' : 'Next page' }).click();
      await expect(page.locator('.catalog-pagination')).toContainText('11–11');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
    } finally {
      await page.request.post('/api/account/delete', { data: { password } });
    }
  });
