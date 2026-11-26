import { expect, test } from '@playwright/test';
import sharp from 'sharp';

for (const language of ['en', 'he'] as const) {
  test(`coach access, nutrition updates and photo consent in ${language}`, async ({ browser }) => {
    const he = language === 'he';
    const coach = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const client = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const password = 'Coach-Integration21!';
    const suffix = Date.now();
    const email = `trainee-${suffix}@example.test`;
    const coachEmail = `trainer-${suffix}@example.test`;
    try {
      const coachRegister = await coach.request.post('/api/auth/register', {
        data: {
          name: 'Trainer',
          email: coachEmail,
          role: 'COACH',
          phone: '+972501234567',
          acceptTerms: true,
          password,
          language,
        },
      });
      const clientRegister = await client.request.post('/api/auth/register', {
        data: {
          name: 'Trainee',
          email,
          role: 'INDEPENDENT',
          acceptTerms: true,
          password,
          language,
        },
      });
      expect(coachRegister.ok()).toBeTruthy();
      expect(clientRegister.ok()).toBeTruthy();
      const { user } = await clientRegister.json();
      expect((await coach.request.get(`/api/progress/photos?userId=${user.id}`)).status()).toBe(
        403,
      );
      expect(
        (await coach.request.post('/api/clients/invite', { data: { email } })).ok(),
      ).toBeTruthy();
      const { relationships } = await (await client.request.get('/api/state')).json();
      expect(
        (
          await client.request.post('/api/clients/respond', {
            data: { id: relationships[0].id, accept: true },
          })
        ).ok(),
      ).toBeTruthy();
      const image = await sharp({
        create: { width: 20, height: 20, channels: 3, background: '#2b6650' },
      })
        .jpeg()
        .toBuffer();
      expect(
        (
          await client.request.post('/api/progress/photos', {
            data: { image: image.toString('base64') },
          })
        ).ok(),
      ).toBeTruthy();
      const page = await coach.newPage();
      await page.goto('/app/clients');
      await expect(page.locator('html')).toHaveAttribute('dir', he ? 'rtl' : 'ltr');
      await page.getByRole('button', { name: he ? 'פרופיל מתאמן' : 'Client profile' }).click();
      const dialog = page.locator('.client-profile');
      await dialog.getByRole('tab', { name: he ? 'משקל' : 'Weight', exact: true }).click();
      await expect(
        dialog.getByRole('heading', { name: he ? 'תמונות מעקב' : 'Progress photos' }),
      ).toBeVisible();
      await expect
        .poll(() =>
          dialog
            .locator('figure img')
            .evaluate((element: HTMLImageElement) => element.naturalWidth),
        )
        .toBe(20);
      await page.goto('/app/nutrition');
      await expect(
        page.getByRole('heading', { name: he ? 'תוכניות תזונה' : 'Meal plans', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.nutrition-stats, .water-card, .meal-list')).toHaveCount(0);
      await page
        .getByRole('button', { name: he ? 'יצירת תוכנית תזונה' : 'Create meal plan' })
        .click();
      const editor = page.getByRole('dialog');
      await editor.locator('[name=name]').fill('Training menu');
      await editor.locator('[name=content]').fill('Rice and vegetables');
      await editor.getByRole('radio', { name: he ? 'בחירת ימים' : 'Choose days' }).click();
      await editor.locator('.weekday-chips [data-day="6"]').click();
      await editor.locator('button[type=submit], button.primary').last().click();
      await expect(page.getByRole('heading', { name: 'Training menu' })).toBeVisible();
      const templateState = await (await coach.request.get('/api/state')).json();
      const template = templateState.mealPlans.find(
        (plan: { name: string }) => plan.name === 'Training menu',
      );
      expect(template.assignedClientId).toBeNull();
      for (const [path, data] of [
        ['meal-plans/check', { planId: template.id, date: '2026-11-21', completed: true }],
        ['meals/add', { foodId: 'unused', grams: 100, meal: 'breakfast', date: '2026-11-21' }],
        ['meals/delete', { id: 'unused' }],
        ['meals/copy', { from: '2026-11-20', to: '2026-11-21' }],
        ['water', { ml: 250, date: '2026-11-21' }],
      ] as const) {
        expect((await coach.request.post(`/api/${path}`, { data })).status()).toBe(403);
      }
      expect(templateState.meals).toEqual([]);
      expect(templateState.water).toEqual([]);
      expect(templateState.mealChecks).toEqual([]);
      expect((await (await client.request.get('/api/state')).json()).mealPlans).toEqual([]);
      await page
        .getByRole('button', { name: he ? 'שיוך למתאמן' : 'Assign to client', exact: true })
        .click();
      await editor.locator('[name=assignedClientId]').selectOption(user.id);
      await editor.locator('button[type=submit], button.primary').last().click();
      await expect(editor).toHaveCount(0);
      await page.getByRole('button', { name: he ? 'עריכה' : 'Edit', exact: true }).click();
      await editor.locator('[name=content]').fill('Lentils and vegetables');
      await editor.locator('button[type=submit], button.primary').last().click();
      await expect(page.getByText('Lentils and vegetables')).toBeVisible();
      const clientState = await (await client.request.get('/api/state')).json();
      expect(clientState.mealPlans[0]).toMatchObject({
        content: 'Lentils and vegetables',
        menuWeekdays: '6',
      });
      const check = { planId: clientState.mealPlans[0].id, date: '2026-11-21', completed: true };
      expect(
        (
          await client.request.post('/api/meal-plans/check', {
            data: { ...check, date: '2026-11-22' },
          })
        ).status(),
      ).toBe(403);
      expect(
        (await client.request.post('/api/meal-plans/check', { data: check })).ok(),
      ).toBeTruthy();
      const diary = await (await client.request.get('/api/state?date=2026-11-21')).json();
      expect(diary.mealChecks).toEqual([{ planId: check.planId, meal: '' }]);
      expect(diary.meals).toEqual([]);
      expect(
        (
          await client.request.post('/api/clients/revoke', { data: { id: relationships[0].id } })
        ).ok(),
      ).toBeTruthy();
      expect((await coach.request.get(`/api/progress/photos?userId=${user.id}`)).status()).toBe(
        403,
      );
      expect((await (await client.request.get('/api/state')).json()).mealPlans).toEqual([]);
    } finally {
      await coach.request.post('/api/account/delete', { data: { password } });
      await client.request.post('/api/account/delete', { data: { password } });
      await coach.close();
      await client.close();
    }
  });
}
