import { expect, test } from '@playwright/test';

for (const language of ['en', 'he'] as const) {
  test(`weight replacement, live PR, exercise icon and next-set weight in ${language}`, async ({
    page,
  }) => {
    const he = language === 'he';
    const password = 'Workout-Editing-2026!';
    expect(
      (
        await page.request.post('/api/auth/register', {
          data: {
            name: 'Workout editing',
            email: `editing-${language}-${Date.now()}@example.test`,
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
      const saved = await page.request.post('/api/programs/save', {
        data: {
          name: 'Live editing workout',
          days: '1,3,5',
          exercises: [{ exerciseId: 'row', sets: 2, reps: 10, weight: 5, rest: 0 }],
        },
      });
      expect(saved.ok()).toBeTruthy();
      const program = await saved.json();
      const started = await page.request.post('/api/workouts/start', {
        data: { programId: program.id },
      });
      expect(started.ok()).toBeTruthy();
      const workout = await started.json();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/app/active?session=${workout.id}`);
      const icon = page.locator('.workout-exercise-icon img');
      await expect(icon).toBeVisible();
      await expect
        .poll(() => icon.evaluate((element: HTMLImageElement) => element.naturalWidth))
        .toBeGreaterThan(0);
      const demonstration = await (
        await page.request.get('/api/exercises/row/demonstration')
      ).json();
      await expect(icon).toHaveAttribute('src', demonstration.media.poster);
      await expect(page.locator('video')).toHaveCount(0);
      await page.locator('.current-exercise button.text-button').first().click();
      await expect(page.locator('[role="dialog"] .exercise-demo-gif')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('video')).toHaveCount(0);
      const rows = page.locator('.set-row');
      const weight = rows.nth(0).getByLabel(he ? 'משקל' : 'Weight', { exact: true });
      await weight.click();
      await weight.pressSequentially('25');
      await expect(weight).toHaveValue('25');
      await weight.click();
      await weight.pressSequentially('30');
      await expect(weight).toHaveValue('30');
      await rows.nth(0).locator('.set-check').click();
      await expect(rows.nth(0).locator('.set-check')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.toast')).toContainText(
        he ? 'שיא אישי חדש!' : 'New personal record!',
      );
      const celebration = page.getByRole('alertdialog', {
        name: he ? 'שיא אישי חדש!' : 'New personal record!',
      });
      await expect(celebration).toBeVisible();
      await expect(celebration).toContainText('30');
      await expect(
        celebration.getByRole('button', { name: he ? 'ממשיכים' : 'Keep going' }),
      ).toBeVisible();
      await page.waitForTimeout(3800);
      await expect(celebration).toBeVisible();
      await page.screenshot({
        path: 'test-results/pr-celebration-' + language + '.png',
        fullPage: true,
      });
      await celebration.getByRole('button', { name: he ? 'ממשיכים' : 'Keep going' }).click();
      await expect(celebration).toHaveCount(0);
      await expect(page.locator('.live-record')).toBeVisible();
      await expect(page.locator('.previous-set')).toContainText('10 × 30');
      await expect(rows.nth(1).getByLabel(he ? 'משקל' : 'Weight', { exact: true })).toHaveValue(
        '30',
      );
      let state = await (await page.request.get('/api/state')).json();
      const session = state.workouts.find((item: { id: string }) => item.id === workout.id);
      expect(session.status).toBe('ACTIVE');
      expect(session.sets[1].weight).toBe(30);
      const unchanged = await page.request.post('/api/workouts/update', {
        data: {
          id: workout.id,
          set: { id: session.sets[0].id, weight: 30, reps: 10, completed: true },
        },
      });
      expect((await unchanged.json()).personalRecord).toBe(false);
      state = await (await page.request.get('/api/state')).json();
      expect(
        state.notifications.filter(
          (item: { key: string; detail: string }) =>
            item.key === 'newRecord' && item.detail === workout.id,
        ),
      ).toHaveLength(1);
      await page.reload();
      await expect
        .poll(() =>
          page
            .locator('.workout-exercise-icon img')
            .evaluate((element: HTMLImageElement) => element.naturalWidth),
        )
        .toBeGreaterThan(0);
      await expect(page.locator('video')).toHaveCount(0);
      await expect(page.locator('.previous-set')).toContainText('10 × 30');
      await expect(
        page
          .locator('.set-row')
          .nth(1)
          .getByLabel(he ? 'משקל' : 'Weight', { exact: true }),
      ).toHaveValue('30');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
      await page.screenshot({
        path: `test-results/workout-editing-${language}.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await expect(
        page
          .getByRole('button', { name: he ? 'צעדים ופעילות' : 'Steps & activity', exact: true })
          .locator('svg'),
      ).toHaveClass(/lucide-footprints/);
      await expect(
        page
          .getByRole('button', { name: he ? 'ההתקדמות שלי' : 'My progress', exact: true })
          .locator('svg'),
      ).toHaveClass(/lucide-trending-up/);
      await page
        .locator('.set-row')
        .nth(1)
        .getByLabel(he ? 'משקל' : 'Weight', { exact: true })
        .fill('35');
      await page.locator('.set-row').nth(1).locator('.set-check').click();
      await expect(celebration).toBeVisible();
      await expect(celebration).toContainText('35');
      await celebration.getByRole('button', { name: he ? 'ממשיכים' : 'Keep going' }).click();
    } finally {
      await page.request.post('/api/account/delete', { data: { password } });
    }
  });
}
