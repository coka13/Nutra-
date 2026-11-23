import { test, expect } from '@playwright/test';

for (const language of ['en', 'he'] as const) {
  test(
    'complete muscle library, preacher animation and direct workout creation in ' + language,
    async ({ page }) => {
      const he = language === 'he';
      const password = 'Free-Catalog-Test-2026!';
      expect(
        (
          await page.request.post('/api/auth/register', {
            data: {
              name: 'Full Catalog Test',
              email: 'catalog-' + language + '-' + Date.now() + '@example.test',
              password,
              role: 'INDEPENDENT',
              language,
            },
          })
        ).ok(),
      ).toBeTruthy();
      try {
        const catalog = await (await page.request.get('/api/exercise-catalog')).json();
        expect(catalog.total).toBeGreaterThanOrEqual(1029);
        expect(catalog.results.every((row: { hasVideo: boolean }) => row.hasVideo)).toBeTruthy();
        const library = await (await page.request.get('/api/library')).json();
        expect(
          library.exercises.every((row: { hasDemonstration: boolean }) => row.hasDemonstration),
        ).toBeTruthy();
        const rejected = await page.request.post('/api/programs/save', {
          data: {
            name: 'Unsupported exercise should be rejected',
            days: '1',
            exercises: [{ exerciseId: 'fe_3_4_Sit-Up', sets: 1, reps: 10, rest: 30, weight: 0 }],
          },
        });
        expect(rejected.status()).toBe(400);
        expect((await rejected.json()).error).toBe('animationRequired');

        expect(library.exercises.some((row: { id: string }) => row.id === 'fl_0070')).toBeTruthy();
        expect(
          library.exercises.some((row: { id: string }) => row.id === 'fe_Machine_Preacher_Curls'),
        ).toBeTruthy();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/app/library');
        await expect(page.locator('.catalog-card')).toHaveCount(36);
        await expect(
          page.getByRole('combobox', { name: he ? 'ציוד' : 'Equipment', exact: true }),
        ).toHaveCount(0);
        await page
          .getByLabel(he ? 'שרירים עיקריים' : 'Primary muscles', { exact: true })
          .selectOption('biceps');
        await page.locator('.catalog-search').fill('preacher chair');
        await expect(
          page.getByRole('heading', {
            name: he ? 'כפיפת מרפקים בכיסא כומר במכונה' : 'Machine Preacher Curls',
            exact: true,
          }),
        ).toBeVisible();
        const card = page
          .locator('.catalog-card')
          .filter({
            has: page.getByRole('heading', {
              name: he ? 'כפיפת מרפקים בכיסא כומר עם מוט' : 'Barbell Preacher Curl',
              exact: true,
            }),
          })
          .first();
        await expect(card).toBeVisible();
        await card.click();
        const video = page.locator('.exercise-demo-gif');
        await expect(video).toHaveAttribute('src', /^\/exercise-gifs\/[a-f0-9-]+\.gif$/);
        await expect
          .poll(() => video.evaluate((element: HTMLImageElement) => element.naturalWidth))
          .toBeGreaterThan(0);
        await expect(page.locator('.exercise-demo a')).toHaveCount(0);
        await page
          .getByRole('button', { name: he ? 'השהיית הדגמה' : 'Pause demonstration', exact: true })
          .click();
        await expect(video).toHaveCount(0);
        await page
          .getByRole('button', { name: he ? 'הפעלת הדגמה' : 'Play demonstration', exact: true })
          .click();
        await expect(video).toBeVisible();
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await expect(video).toHaveCount(0);
        await page.screenshot({
          path: 'test-results/preacher-' + language + '.png',
          fullPage: true,
        });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBeTruthy();
        await page
          .getByRole('button', { name: he ? 'הוספה לאימון' : 'Add to workout', exact: true })
          .click();
        await expect(page.locator('.builder-exercise')).toContainText(
          he ? 'כפיפת מרפקים בכיסא כומר עם מוט' : 'Barbell Preacher Curl',
        );
        await page.getByLabel(he ? 'שם' : 'Name', { exact: true }).fill('Preacher GIF plan');
        await page.locator('.builder-library input').fill('preacher chair');
        await expect(
          page
            .locator('.builder-muscle-group summary')
            .filter({ hasText: he ? 'השריר הדו־ראשי' : 'Biceps' }),
        ).toContainText(he ? 'השריר הדו־ראשי' : 'Biceps');
        const machine = page
          .locator('.library-add-row')
          .filter({ hasText: he ? 'כפיפת מרפקים בכיסא כומר במכונה' : 'Machine Preacher Curls' });
        await machine.click();
        await expect(page.locator('.builder-exercise')).toHaveCount(2);
        const savedResponse = page.waitForResponse(
          (response) =>
            response.url().endsWith('/api/programs/save') && response.request().method() === 'POST',
        );
        await page
          .getByRole('button', { name: he ? 'שמירת שינויים' : 'Save changes', exact: true })
          .click();
        const saved = await savedResponse;
        expect(saved.ok()).toBeTruthy();
        const { id } = await saved.json();
        await expect(
          page.getByRole('heading', { name: 'Preacher GIF plan', exact: true }),
        ).toBeVisible();
        const started = await page.request.post('/api/workouts/start', { data: { programId: id } });
        expect(started.ok()).toBeTruthy();
        const workout = await started.json();
        await page.goto('/app/active?session=' + workout.id);
        await expect(page.locator('.active-exercise')).toHaveCount(2);
      } finally {
        await page.request.post('/api/account/delete', { data: { password } });
      }
    },
  );
}

test('new SmartWorkout exercise plays and can be saved into a workout in Hebrew', async ({
  page,
}) => {
  const password = 'SmartWorkout-Native-2026!';
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: {
          name: 'Native catalog test',
          email: 'native-' + Date.now() + '@example.test',
          password,
          role: 'INDEPENDENT',
          language: 'he',
        },
      })
    ).ok(),
  ).toBeTruthy();
  try {
    const { results } = await (
      await page.request.get('/api/exercise-catalog?name=Machine%20Chest%20Fly')
    ).json();
    const exercise = results.find((row: { id: string }) => row.id === 'sw_chest-machine-chest-fly');
    expect(exercise).toBeTruthy();
    expect(exercise.hasVideo).toBe(true);
    expect(exercise.nameHe).toMatch(/[א-ת]/);
    expect(exercise.instructionsHe).toMatch(/[א-ת]/);
    await page.goto('/app/library');
    await page.locator('.catalog-search').fill('Machine Chest Fly');
    await page
      .locator('.catalog-card')
      .filter({ has: page.getByRole('heading', { name: exercise.nameHe, exact: true }) })
      .click();
    const video = page.locator('.exercise-demo-gif');
    await expect(video).toBeVisible();
    await expect
      .poll(() => video.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0);
    await expect(page.locator('.instruction-copy')).toContainText(/[א-ת]/);
    await expect(page.locator('.exercise-demo a')).toHaveCount(0);
    await page.getByRole('button', { name: 'הוספה לאימון', exact: true }).click();
    await expect(page.locator('.builder-exercise')).toContainText(exercise.nameHe);
    await page.getByLabel('שם', { exact: true }).fill('SmartWorkout native plan');
    const saving = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/programs/save') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'שמירת שינויים', exact: true }).click();
    const saved = await saving;
    expect(saved.ok()).toBeTruthy();
    const { id } = await saved.json();
    const started = await page.request.post('/api/workouts/start', { data: { programId: id } });
    expect(started.ok()).toBeTruthy();
    const workout = await started.json();
    await page.goto('/app/active?session=' + workout.id);
    await expect(page.locator('.current-exercise')).toContainText(exercise.nameHe);
    await page.locator('.current-exercise button.text-button').first().click();
    await expect(page.locator('.exercise-demo-gif')).toBeVisible();
  } finally {
    await page.request.post('/api/account/delete', { data: { password } });
  }
});
