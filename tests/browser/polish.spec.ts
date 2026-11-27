import { test, expect } from '@playwright/test';
import { grantCoachPlan } from './coach-plan';

const password = 'Polish-Regression-2026!';
async function register(
  context: import('@playwright/test').BrowserContext,
  name: string,
  role = 'INDEPENDENT',
  language = 'en',
) {
  const email = `polish-${name}-${Date.now()}@example.test`;
  const response = await context.request.post('/api/auth/register', {
    data: {
      name,
      role,
      email,
      acceptTerms: true,
      healthConsent: true,
      password,
      language,
      phone: role === 'COACH' ? '+972501234567' : undefined,
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).user;
}

test('repeat invitations keep consent and ad entitlements; retained private foods stay private', async ({
  browser,
}) => {
  const coach = await browser.newContext(),
    client = await browser.newContext(),
    outsider = await browser.newContext();
  try {
    await grantCoachPlan((await register(coach, 'Coach', 'COACH')).email);
    const user = await register(client, 'Client');
    await register(outsider, 'Outsider');
    const invite = () => coach.request.post('/api/clients/invite', { data: { email: user.email } });
    expect((await invite()).ok()).toBeTruthy();
    expect((await invite()).ok()).toBeTruthy();
    let state = await (await client.request.get('/api/state')).json();
    expect(
      state.notifications.filter((n: { key: string }) => n.key === 'coachInvite'),
    ).toHaveLength(1);
    expect(state.entitlements.ads).toBe(true);
    const link = state.relationships[0];
    expect(
      (
        await client.request.post('/api/clients/respond', { data: { id: link.id, accept: true } })
      ).ok(),
    ).toBeTruthy();
    expect((await invite()).ok()).toBeTruthy();
    state = await (await client.request.get('/api/state')).json();
    expect(state.relationships[0].status).toBe('ACTIVE');
    expect(state.entitlements.ads).toBe(false);
    const foodName = `Private family recipe ${Date.now()}`;
    expect(
      (
        await coach.request.post('/api/foods', {
          data: {
            nameEn: foodName,
            nameHe: foodName,
            calories: 125,
            protein: 5,
            carbs: 15,
            fat: 3,
            fiber: 2,
          },
        })
      ).ok(),
    ).toBeTruthy();
    const library = await (await coach.request.get('/api/library')).json();
    const food = library.foods.find((f: { nameEn: string }) => f.nameEn === foodName);
    expect(
      (
        await coach.request.post('/api/meal-plans', {
          data: {
            name: 'Shared plan',
            assignedClientId: user.id,
            content: '',
            items: [{ foodId: food.id, grams: 200, meal: 'lunch' }],
          },
        })
      ).ok(),
    ).toBeTruthy();
    state = await (await client.request.get('/api/state')).json();
    const item = state.mealPlans[0].items[0];
    const date = '2026-11-26';
    expect(
      (
        await client.request.post('/api/meal-plans/eat', {
          data: { itemId: item.id, date, eaten: true },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (await coach.request.post('/api/account/delete', { data: { password } })).ok(),
    ).toBeTruthy();
    const diary = await (await client.request.get(`/api/state?date=${date}`)).json();
    expect(diary.meals[0].food.calories).toBe(125);
    expect(diary.entitlements.ads).toBe(true);
    const publicLibrary = await (await outsider.request.get('/api/library')).json();
    expect(publicLibrary.foods.some((f: { id: string }) => f.id === food.id)).toBe(false);
    expect(
      (
        await (
          await outsider.request.get('/api/foods/search?q=' + encodeURIComponent(foodName))
        ).json()
      ).results,
    ).toEqual([]);
    expect(
      (
        await outsider.request.post('/api/meals/add', {
          data: { foodId: food.id, grams: 100, meal: 'lunch', date },
        })
      ).status(),
    ).toBe(403);
  } finally {
    for (const context of [coach, client, outsider]) {
      await context.request.post('/api/account/delete', { data: { password } });
      await context.close();
    }
  }
});

test('logging planned meals and copying a day cannot duplicate entries', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await register(context, 'Meals');
    const date = '2026-11-25';
    const foodId = (await (await context.request.get('/api/library')).json()).foods[0].id;
    expect(
      (
        await context.request.post('/api/meal-plans', {
          data: {
            name: 'Daily plan',
            assignedClientId: null,
            items: [{ foodId, grams: 100, meal: 'breakfast' }],
          },
        })
      ).ok(),
    ).toBeTruthy();
    const plan = (await (await context.request.get(`/api/state?date=${date}`)).json()).mealPlans[0];
    for (let i = 0; i < 2; i++)
      expect(
        (
          await context.request.post('/api/meal-plans/log', { data: { planId: plan.id, date } })
        ).ok(),
      ).toBeTruthy();
    expect(
      (
        await context.request.post('/api/meal-plans/eat', {
          data: { itemId: plan.items[0].id, date, eaten: true },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (await (await context.request.get(`/api/state?date=${date}`)).json()).meals,
    ).toHaveLength(1);
    for (let i = 0; i < 2; i++)
      expect(
        (
          await context.request.post('/api/meals/copy', { data: { from: date, to: '2026-11-26' } })
        ).ok(),
      ).toBeTruthy();
    expect(
      (await (await context.request.get('/api/state?date=2026-11-26')).json()).meals,
    ).toHaveLength(1);
    expect(
      (await context.request.post('/api/meals/copy', { data: { from: date, to: date } })).status(),
    ).toBe(400);
  } finally {
    await context.request.post('/api/account/delete', { data: { password } });
    await context.close();
  }
});

for (const language of ['en', 'he'])
  test(`mobile polish, retry and successful save after lost refresh in ${language}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 360, height: 740 },
      reducedMotion: 'reduce',
    });
    try {
      await register(context, 'Mobile', 'INDEPENDENT', language);
      const he = language === 'he';
      const page = await context.newPage();
      let unavailable = true;
      await page.route('**/api/library', (route) =>
        unavailable
          ? route.fulfill({ status: 503, json: { error: 'unavailable' } })
          : route.continue(),
      );
      await page.goto('/app/nutrition');
      const warning = page
        .getByRole('alert')
        .filter({ hasText: he ? 'לא ניתן לטעון' : 'could not load' });
      await expect(warning).toBeVisible();
      unavailable = false;
      await warning
        .getByRole('button', { name: he ? 'ניסיון נוסף' : 'Try again', exact: true })
        .click();
      await expect(warning).toHaveCount(0);
      await page
        .getByRole('button', { name: he ? 'הזנה ידנית' : 'Enter manually', exact: true })
        .first()
        .click();
      const modal = page.getByRole('dialog');
      await modal.locator('[name=name]').fill('Balanced lunch');
      await modal.locator('[name=calories]').fill('350');
      // The server write succeeds, but the follow-up read is lost.
      await page.route('**/api/state?**', (route) => route.abort('failed'));
      await modal.locator('button[type=submit]').click();
      await expect(modal).toHaveCount(0);
      await expect(page.locator('.toast')).toContainText(he ? 'נשמר' : 'Saved');
      await page.unroute('**/api/state?**');
      await page.reload();
      await expect(page.locator('.meal-list')).toContainText('Balanced lunch');
      const state = await (await context.request.get('/api/state')).json();
      expect(state.meals).toHaveLength(1);
      for (const theme of ['dark', 'light']) {
        await context.request.post('/api/preferences', { data: { theme } });
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('.meal-list')).toContainText('Balanced lunch');
        await expect(page.locator('html')).toHaveAttribute('dir', he ? 'rtl' : 'ltr');
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBeTruthy();
        await page.screenshot({
          path: `test-results/polish-nutrition-${language}-${theme}.png`,
          fullPage: true,
        });
      }
      await context.setOffline(true);
      await expect(
        page.getByRole('status').filter({ hasText: he ? 'חיבור' : 'offline' }),
      ).toBeVisible();
      await context.setOffline(false);
    } finally {
      await context.setOffline(false);
      await context.request.post('/api/account/delete', { data: { password } });
      await context.close();
    }
  });
