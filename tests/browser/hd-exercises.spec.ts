import { test, expect } from '@playwright/test';

for (const language of ['en', 'he'] as const) {
  test(`SmartWorkout GIF playback, retry and translated exercise details in ${language}`, async ({
    page,
  }) => {
    const he = language === 'he';
    const password = 'HD-Demo-Test-2026!';
    expect(
      (
        await page.request.post('/api/auth/register', {
          data: {
            name: 'HD Test',
            email: `hd-${language}-${Date.now()}@example.test`,
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
      const library = await (await page.request.get('/api/library')).json();
      const bench = library.exercises.find(
        (exercise: { nameEn: string }) => exercise.nameEn === 'Dumbbell Bench Press',
      );
      const benchName = he ? bench.nameHe : bench.nameEn;
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/app/library');
      await page.locator('.catalog-search').fill(benchName);
      const card = page.locator('.catalog-card').filter({
        has: page.getByRole('heading', {
          name: benchName,
          exact: true,
        }),
      });
      await expect(card).toHaveCount(1);
      await expect(card.locator('.catalog-thumbnail')).toHaveCSS(
        'background-color',
        'rgb(247, 247, 247)',
      );
      await card.click();
      const video = page.locator('.exercise-demo-gif');
      await expect(video).toHaveAttribute('src', /^\/exercise-gifs\/[a-f0-9-]+\.gif$/);
      await expect(page.locator('video')).toHaveCount(0);
      await expect
        .poll(() => video.evaluate((element: HTMLImageElement) => element.naturalWidth))
        .toBeGreaterThan(0);
      await expect(video).toBeVisible();
      if (he) {
        await expect(page.getByRole('dialog')).toHaveAccessibleName(benchName);
        await expect(page.locator('.instruction-copy')).toContainText(/[א-ת]/);
        await expect(page.locator('.instruction-copy')).not.toContainText('Lie down');
      }
      await page.screenshot({ path: `test-results/hd-video-${language}.png`, fullPage: true });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
      await video.evaluate((element) => element.dispatchEvent(new Event('error')));
      await expect(page.locator('.exercise-demo-gif')).toHaveCount(0);
      await expect(page.locator('.technique-frames')).toHaveCount(0);
      await expect(page.locator('.exercise-demo a')).toHaveCount(0);
      await page
        .getByRole('button', { name: he ? 'ניסיון נוסף' : 'Try again', exact: true })
        .click();
      await expect(page.locator('.exercise-demo-gif')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.locator('.catalog-search').fill('Barbell Bench Press');
      const professional = page.locator('.catalog-card').filter({
        has: page.getByRole('heading', {
          name: he ? 'לחיצת חזה במוט' : 'Barbell Bench Press',
          exact: true,
        }),
      });
      await professional.click();
      await expect(page.locator('.exercise-demo-gif')).toHaveAttribute(
        'src',
        /^\/exercise-gifs\/[a-f0-9-]+\.gif$/,
      );
      await expect(page.locator('.exercise-demo a')).toHaveCount(0);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(page.locator('.exercise-demo-gif')).toHaveCount(0);
    } finally {
      await page.request.post('/api/account/delete', { data: { password } });
    }
  });
}
