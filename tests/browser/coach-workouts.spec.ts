import { expect, test } from '@playwright/test';

for (const language of ['en', 'he'] as const) {
  test(`coach saves and assigns reusable workouts without personal tracking in ${language}`, async ({
    browser,
  }) => {
    const coach = await browser.newContext();
    const client = await browser.newContext();
    const password = 'Coach-Workouts-2026!';
    const suffix = `${language}-${Date.now()}`;
    const he = language === 'he';
    try {
      expect(
        (
          await coach.request.post('/api/auth/register', {
            data: {
              name: 'Workout coach',
              email: `coach-workouts-${suffix}@example.test`,
              acceptTerms: true,
              password,
              role: 'COACH',
              phone: '+972501234567',
              language,
            },
          })
        ).ok(),
      ).toBeTruthy();
      const registered = await client.request.post('/api/auth/register', {
        data: {
          name: 'Workout client',
          email: `client-workouts-${suffix}@example.test`,
          acceptTerms: true,
          password,
          role: 'INDEPENDENT',
          language,
        },
      });
      expect(registered.ok()).toBeTruthy();
      const { user } = await registered.json();
      expect(
        (await coach.request.post('/api/clients/invite', { data: { email: user.email } })).ok(),
      ).toBeTruthy();
      const { relationships } = await (await client.request.get('/api/state')).json();
      expect(
        (
          await client.request.post('/api/clients/respond', {
            data: { id: relationships[0].id, accept: true },
          })
        ).ok(),
      ).toBeTruthy();
      const saved = await coach.request.post('/api/programs/save', {
        data: {
          name: 'Reusable strength',
          days: '1,3,5',
          exercises: [{ exerciseId: 'row', sets: 3, reps: 10, rest: 60, weight: 5 }],
        },
      });
      expect(saved.ok()).toBeTruthy();
      const original = await saved.json();
      const page = await coach.newPage();
      await page.goto('/app/settings');
      await expect(
        page.locator('[name="goal"], [name="weightKg"], [name="heightCm"], [name="frequency"]'),
      ).toHaveCount(0);
      await page.locator('[name="name"]').fill('Updated coach');
      await page
        .getByRole('button', { name: he ? 'שמירת שינויים' : 'Save changes', exact: true })
        .click();
      await expect
        .poll(async () => (await (await coach.request.get('/api/state')).json()).user.name)
        .toBe('Updated coach');
      await page.goto('/app/workouts');
      await expect(
        page.getByRole('button', { name: he ? 'התחלת אימון' : 'Start workout', exact: true }),
      ).toHaveCount(0);
      await expect(page.locator('.day-picker')).toHaveCount(0);
      await page
        .locator('.program-card')
        .filter({ hasText: 'Reusable strength' })
        .getByRole('button', { name: he ? 'שיוך למתאמן' : 'Assign to client' })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('select').selectOption(user.id);
      await dialog.getByRole('button', { name: he ? 'שיוך למתאמן' : 'Assign to client' }).click();
      await expect(dialog).toHaveCount(0);
      const coachState = await (await coach.request.get('/api/state')).json();
      expect(
        coachState.programs.find((p: { id: string }) => p.id === original.id).assignedClientId,
      ).toBe(user.id);
      const clientState = await (await client.request.get('/api/state')).json();
      const assigned = clientState.programs.find(
        (p: { assignedClientId: string }) => p.assignedClientId === user.id,
      );
      expect(assigned.name).toBe('Reusable strength');
      expect(assigned.exercises).toHaveLength(1);
      expect(
        (
          await coach.request.post('/api/workouts/start', { data: { programId: original.id } })
        ).status(),
      ).toBe(403);
      expect(
        (
          await client.request.post('/api/workouts/start', { data: { programId: assigned.id } })
        ).ok(),
      ).toBeTruthy();
      // Coaches can also build and assign a workout directly in the editor.
      await page.goto('/app/builder');
      await page.locator('input[maxlength="200"]').fill('Manual client workout');
      await page.locator('.builder-details select').selectOption(user.id);
      await page.locator('.builder-muscle-group summary').first().click();
      await page.locator('.library-add-row').first().click();
      await page.locator('.builder-savebar button[type="submit"]').click();
      await expect(page).toHaveURL(/\/app\/workouts/);
      const manualState = await (await client.request.get('/api/state')).json();
      expect(
        manualState.programs.some(
          (p: { name: string; assignedClientId: string }) =>
            p.name === 'Manual client workout' && p.assignedClientId === user.id,
        ),
      ).toBeTruthy();
      await page.goto('/app/progress');
      await expect(page.locator('main')).toContainText(he ? 'מתאמנים' : 'Clients');
      await expect(page.locator('[name="weightKg"]')).toHaveCount(0);
    } finally {
      await coach.request.post('/api/account/delete', { data: { password } });
      await client.request.post('/api/account/delete', { data: { password } });
      await coach.close();
      await client.close();
    }
  });
}
