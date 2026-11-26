import { test, expect } from '@playwright/test';

for (const language of ['en', 'he'] as const) {
  test(`mobile workout, rest controls, exercise demonstration and records in ${language}`, async ({
    page,
  }) => {
    const he = language === 'he';
    const password = 'Mobile-Training-Test19!';
    const providerRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('workoutx')) providerRequests.push(request.url());
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('.home-art')).toBeVisible();
    await expect
      .poll(() =>
        page.locator('.home-art').evaluate((element: HTMLImageElement) => element.naturalWidth),
      )
      .toBe(1000);
    expect(
      (
        await page.request.post('/api/auth/register', {
          data: {
            name: 'Workout Test',
            email: `training-${language}-${Date.now()}@example.test`,
            acceptTerms: true,
            password,
            role: 'INDEPENDENT',
            language,
          },
        })
      ).ok(),
    ).toBeTruthy();
    try {
      // The retired provider cannot be selected or imported, even through direct API calls.
      expect((await page.request.get('/api/exercise-catalog?provider=workoutx')).status()).toBe(
        400,
      );
      expect(
        (
          await page.request.post('/api/exercise-catalog', { data: { id: 'wx_ex_ABC123' } })
        ).status(),
      ).toBe(400);
      const retiredDemo = await (
        await page.request.get('/api/exercises/wx_ex_ABC123/demonstration?provider=workoutx')
      ).json();
      expect(retiredDemo.provider).toBe('smartworkout');
      expect(retiredDemo.media).toBeNull();
      const program = await page.request.post('/api/programs/save', {
        data: {
          name: 'Test circuit',
          days: '1,3,5',
          exercises: ['squat', 'pushup'].map((exerciseId) => ({
            exerciseId,
            sets: 1,
            reps: 10,
            rest: 90,
            weight: 5,
          })),
        },
      });
      expect(program.ok()).toBeTruthy();
      const { id, weeks } = await program.json();
      expect(weeks).toBe(0);
      await page.goto('/app/workouts');
      const card = page.locator('.program-card').filter({ hasText: 'Test circuit' });
      await expect(card.locator('.program-day-label')).toContainText(he ? 'יום שני' : 'Monday');
      await expect(card.locator('.program-day-label')).toContainText(
        he ? 'יום רביעי' : 'Wednesday',
      );
      await expect(card.locator('.program-day-label')).toContainText(he ? 'יום שישי' : 'Friday');
      await card.getByRole('button', { name: he ? 'עריכה' : 'Edit', exact: true }).click();
      await expect(page.getByLabel(he ? 'שבועות' : 'Weeks', { exact: true })).toHaveCount(0);
      expect(
        (await page.request.post('/api/workouts/start', { data: { programId: id } })).ok(),
      ).toBeTruthy();
      await page.goto('/app/active');
      await expect(page.locator('html')).toHaveAttribute('dir', he ? 'rtl' : 'ltr');
      await expect(page.locator('.current-exercise')).toContainText(
        he ? 'סקוואט משקל גוף' : 'Bodyweight squat',
      );
      await page.locator('.current-exercise button.text-button').first().click();
      await expect(page.locator('.exercise-demo-gif')).toHaveAttribute(
        'src',
        /^\/exercise-gifs\/[a-f0-9-]+\.gif$/,
      );
      await expect(page.locator('.exercise-demo a')).toHaveCount(0);
      expect(providerRequests).toEqual([]);
      await page.keyboard.press('Escape');
      await page.locator('.current-exercise .set-check').click();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: he ? 'ממשיכים' : 'Keep going', exact: true })
        .click();
      await expect(page.locator('.current-exercise')).toContainText(
        he ? 'שכיבות סמיכה בשיפוע' : 'Incline push-up',
      );
      await expect(page.locator('.rest-timer')).toBeVisible();
      await page.locator('.rest-timer button').first().click();
      await page.reload();
      await expect(page.locator('.rest-timer')).toBeVisible();
      await page.locator('.rest-timer button').nth(1).click();
      await page.getByRole('button', { name: he ? 'דילוג על המנוחה' : 'Skip rest' }).click();
      await expect(page.locator('.rest-timer')).toHaveCount(0);
      const finishPrompt = page.getByRole('dialog', {
        name: he ? 'כל הסטים הושלמו' : 'All sets complete',
        exact: true,
      });
      await expect(finishPrompt).toHaveCount(0);
      await page.locator('.current-exercise .set-check').click();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: he ? 'ממשיכים' : 'Keep going', exact: true })
        .click();
      await expect(finishPrompt).toBeVisible();
      await finishPrompt.getByRole('button', { name: he ? 'עדיין לא' : 'Not yet' }).click();
      await expect(finishPrompt).toHaveCount(0);
      await expect(page.locator('.set-row')).toHaveCount(2);
      await page.locator('.set-check').last().click();
      await expect(page.locator('.set-check').last()).toHaveAttribute('aria-pressed', 'false');
      await page.locator('.set-check').last().click();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: he ? 'ממשיכים' : 'Keep going', exact: true })
        .click();
      await expect(finishPrompt).toBeVisible();
      await finishPrompt
        .getByRole('button', { name: he ? 'סיום אימון' : 'Finish workout' })
        .click();
      await expect(
        page.getByRole('heading', { name: he ? 'סיכום אימון' : 'Workout summary' }),
      ).toBeVisible();
      await expect(page.locator('.record-achievement')).toBeVisible();
      await page.goto('/app/progress');
      const records = page.locator('.record-shortcut');
      await expect(records).toHaveCount(2);
      await expect(page.locator('.record-metrics')).toHaveCount(0);
      await records.first().click();
      const recordDetails = page.getByRole('dialog');
      await expect(recordDetails).toBeVisible();
      await expect(recordDetails.locator('.record-metrics > div')).toHaveCount(4);
      await expect(recordDetails).toContainText(he ? 'חזרות' : 'Reps');
      await page.keyboard.press('Escape');
      await expect(recordDetails).toHaveCount(0);
      await expect(records.first()).toBeFocused();
      await page.screenshot({
        path: `test-results/progress-records-${language}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
    } finally {
      await page.request.post('/api/account/delete', { data: { password } });
    }
  });
}
