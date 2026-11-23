import { expect, test } from '@playwright/test';

for (const language of ['en', 'he'] as const) {
  test(`workouts prompts to continue active and paused sessions in ${language}`, async ({
    page,
  }) => {
    const he = language === 'he';
    const password = 'Continue-Workout-Test21!';
    await page.setViewportSize({ width: 390, height: 844 });
    const registered = await page.request.post('/api/auth/register', {
      data: {
        name: 'Continue test',
        email: `continue-${language}-${Date.now()}@example.test`,
        password,
        role: 'INDEPENDENT',
        language,
      },
    });
    expect(registered.ok()).toBeTruthy();
    try {
      const prompt = page.getByRole('dialog', {
        name: he ? 'להמשיך את האימון?' : 'Continue your workout?',
      });
      await page.goto('/app/workouts');
      await expect(
        page.getByRole('heading', { name: he ? 'האימונים שלי' : 'My workouts', exact: true }),
      ).toBeVisible();
      await expect(prompt).toHaveCount(0);
      const saved = await page.request.post('/api/programs/save', {
        data: {
          name: 'Unfinished session',
          days: '1,3,5',
          exercises: [{ exerciseId: 'squat', sets: 2, reps: 10, rest: 0, weight: 5 }],
        },
      });
      expect(saved.ok()).toBeTruthy();
      const program = await saved.json();
      const started = await page.request.post('/api/workouts/start', {
        data: { programId: program.id },
      });
      expect(started.ok()).toBeTruthy();
      const workout = await started.json();
      await page.reload();
      await expect(prompt).toContainText('Unfinished session');
      await prompt.getByRole('button', { name: he ? 'עיון באימונים' : 'Browse workouts' }).click();
      await expect(prompt).toHaveCount(0);
      await expect(
        page.locator('.onboarding-banner').filter({ hasText: 'Unfinished session' }),
      ).toBeVisible();
      await page.goto('/app/');
      await page.goto('/app/workouts');
      await expect(prompt).toBeVisible();
      await prompt
        .getByRole('button', { name: he ? 'המשך אימון' : 'Resume session', exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`/app/active\\?session=${workout.id}$`));
      await expect(
        page.getByRole('heading', { name: 'Unfinished session', exact: true }),
      ).toBeVisible();
      expect(
        (
          await page.request.post('/api/workouts/update', {
            data: { id: workout.id, status: 'PAUSED' },
          })
        ).ok(),
      ).toBeTruthy();
      await page.goto('/app/workouts');
      await expect(prompt).toBeVisible();
      await prompt
        .getByRole('button', { name: he ? 'המשך אימון' : 'Resume session', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: he ? 'השהיה' : 'Pause', exact: true }),
      ).toBeVisible();
      const state = await (await page.request.get('/api/state')).json();
      expect(state.workouts.find((entry: { id: string }) => entry.id === workout.id).status).toBe(
        'ACTIVE',
      );
      expect(
        (
          await page.request.post('/api/workouts/update', {
            data: { id: workout.id, status: 'FINISHED' },
          })
        ).ok(),
      ).toBeTruthy();
      await page.goto('/app/workouts');
      await expect(page.locator('.program-card')).toBeVisible();
      await expect(prompt).toHaveCount(0);
    } finally {
      await page.request.post('/api/account/delete', { data: { password } });
    }
  });
}
