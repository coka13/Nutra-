import { expect, test } from '@playwright/test';

for (const language of ['he', 'en'] as const) {
  test(`reset requires warning confirmation and password, preserves account in ${language}`, async ({
    page,
    browser,
  }) => {
    const password = 'Reset-Only-Test123!';
    const email = `reset-${language}-${Date.now()}@example.test`;
    const other = await browser.newContext();
    async function post(path: string, data: unknown) {
      const response = await page.request.post(`/api/${path}`, { data });
      expect(response.ok(), await response.text()).toBeTruthy();
      return response.json();
    }
    try {
      await post('auth/register', {
        name: 'Reset Test',
        email,
        acceptTerms: true,
        password,
        language,
        role: 'INDEPENDENT',
      });
      const otherEmail = `other-${email}`;
      expect(
        (
          await other.request.post('/api/auth/register', {
            data: {
              name: 'Other Test',
              email: otherEmail,
              acceptTerms: true,
              password,
              role: 'INDEPENDENT',
            },
          })
        ).ok(),
      ).toBeTruthy();
      await other.request.post('/api/progress', {
        data: { kind: 'weight', value: 82, unit: 'kg', date: '2026-11-22', note: '' },
      });
      const initial = await (await page.request.get('/api/state')).json();
      await post('profile', {
        ...initial.profile,
        name: 'Reset Test',
        language,
        theme: 'dark',
        onboarded: true,
        adult: true,
      });
      await post('preferences', { language, theme: 'dark' });
      await post('progress', {
        kind: 'weight',
        value: 72,
        unit: 'kg',
        date: '2026-11-22',
        note: '',
      });
      await post('meals/add', {
        foodId: 'apple',
        grams: 150,
        meal: 'breakfast',
        date: '2026-11-22',
      });
      await post('programs/generate', {});
      const before = await (await page.request.get('/api/export')).json();
      expect(before.programs.length).toBeGreaterThan(0);
      await post('workouts/start', { programId: before.programs[0].id });
      expect((await page.request.post('/api/account/reset', { data: { password } })).status()).toBe(
        400,
      );
      expect(
        (
          await page.request.post('/api/account/reset', {
            data: { password: 'wrong', confirmed: true },
          })
        ).status(),
      ).toBe(401);
      await page.goto('/app/settings');
      const title = language === 'he' ? 'איפוס כל הנתונים שלי' : 'Reset all my data';
      const action = language === 'he' ? 'אישור איפוס ומחיקת הנתונים' : 'Permanently reset my data';
      await page.getByRole('button', { name: title, exact: true }).click();
      const dialog = page.getByRole('alertdialog', { name: title });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: action })).toBeDisabled();
      await dialog
        .getByRole('button', { name: language === 'he' ? 'ביטול' : 'Cancel', exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      const unchanged = await (await page.request.get('/api/export')).json();
      expect(unchanged.progress).toHaveLength(1);
      expect(unchanged.workouts).toHaveLength(1);
      await page.getByRole('button', { name: title, exact: true }).click();
      await dialog.locator('input[type=password]').fill(password);
      await dialog.getByRole('checkbox').check();
      await dialog.getByRole('button', { name: action }).click();
      await expect(page).toHaveURL(/\/app\/onboarding$/);
      const after = await (await page.request.get('/api/export')).json();
      for (const key of [
        'programs',
        'workouts',
        'meals',
        'water',
        'recipes',
        'mealPlans',
        'progress',
        'cardioActivities',
        'dailySteps',
        'messages',
        'relationships',
        'appointments',
      ]) {
        expect(after[key], key).toEqual([]);
      }
      expect(after.user.id).toBe(before.user.id);
      expect(after.user).toMatchObject({ email, language, theme: 'dark' });
      expect(after.subscription).toEqual(before.subscription);
      expect(after.profile.onboarded).toBe(false);
      const otherData = await (await other.request.get('/api/export')).json();
      expect(otherData.progress).toHaveLength(1);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('dir', language === 'he' ? 'rtl' : 'ltr');
      expect(
        (await page.request.post('/api/auth/login', { data: { email, password } })).ok(),
      ).toBeTruthy();
    } finally {
      await page.request.post('/api/account/delete', { data: { password } });
      await other.request.post('/api/account/delete', { data: { password } });
      await other.close();
    }
  });
}
