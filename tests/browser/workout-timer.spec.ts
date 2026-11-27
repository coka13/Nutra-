import { expect, test } from '@playwright/test';

test('workout starts at zero, survives reopening, and keeps a separate clock per program', async ({
  page,
}) => {
  const password = 'Timer-Workflow-Test19!';
  const email = `timer-${Date.now()}@example.test`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2030-03-15T10:00:00Z'));
  await page.goto('/');
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: {
          email,
          acceptTerms: true,
          healthConsent: true,
          password,
          name: 'Timer test',
          role: 'INDEPENDENT',
          language: 'en',
        },
      })
    ).ok(),
  ).toBeTruthy();
  try {
    for (const name of ['First workout', 'Second workout']) {
      const saved = await page.request.post('/api/programs/save', {
        data: {
          name,
          weeks: 2,
          days: '1,3,5',
          exercises: [{ exerciseId: 'squat', sets: 1, reps: 10, rest: 0, weight: 0 }],
        },
      });
      expect(saved.ok()).toBeTruthy();
    }
    async function start(name: string) {
      const card = page
        .locator('.program-card')
        .filter({ has: page.getByRole('heading', { name, exact: true }) });
      await card.getByRole('button', { name: 'Start workout', exact: true }).click();
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    const elapsed = page.getByTestId('workout-elapsed');
    await page.goto('/app/workouts');
    await expect(elapsed).toHaveCount(0);
    await start('First workout');
    await expect(elapsed).toHaveText('00:00');
    await expect(elapsed).not.toHaveText('00:00');
    await page.reload();
    await expect(elapsed).not.toHaveText('00:00');
    const firstUrl = page.url();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const resume = page.getByRole('button', { name: 'Resume session', exact: true });
    await expect(resume).toBeVisible();
    const paused = await elapsed.innerText();
    await page.waitForTimeout(1200);
    await expect(elapsed).toHaveText(paused);
    await resume.click();
    await expect(elapsed).not.toHaveText(paused);

    await page.goto('/app/workouts');
    await page
      .getByRole('dialog', { name: 'Continue your workout?' })
      .getByRole('button', { name: 'Browse workouts' })
      .click();
    await start('Second workout');
    await expect(elapsed).toHaveText('00:00');
    expect(page.url()).not.toBe(firstUrl);
    await expect(elapsed).not.toHaveText('00:00');
    await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Workout summary', exact: true })).toBeVisible();
    const { workouts } = await (await page.request.get('/api/state')).json();
    expect(
      workouts.find((workout: { name: string }) => workout.name === 'Second workout'),
    ).toMatchObject({ status: 'FINISHED', elapsedSeconds: expect.any(Number) });
    expect(
      workouts.find((workout: { name: string }) => workout.name === 'Second workout')
        .elapsedSeconds,
    ).toBeGreaterThan(0);
    await page.goto(firstUrl);
    await expect(resume).toBeVisible();
    await expect(elapsed).not.toHaveText('00:00');
  } finally {
    await page.request.post('/api/account/delete', { data: { password } });
  }
});
