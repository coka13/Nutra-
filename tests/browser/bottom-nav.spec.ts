import { expect, test, type Page } from '@playwright/test';

/** Asserts that `upper` ends above the top edge of the bottom tab bar (no overlap). */
async function sitsAboveNav(page: Page, upper: string) {
  const nav = await page.locator('.bottom-nav').boundingBox();
  const box = await page.locator(upper).boundingBox();
  expect(nav && box).toBeTruthy();
  expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y + 1);
}

for (const language of ['en', 'he'] as const) {
  test(`mobile bottom navigation, also in the builder and a live workout, in ${language}`, async ({
    page,
  }) => {
    test.setTimeout(120_000); // first visits compile each page in development
    const he = language === 'he';
    const shots = process.env.SHOTS_DIR || 'test-results';
    const password = 'Bottom-Nav-2026!';
    expect(
      (
        await page.request.post('/api/auth/register', {
          data: {
            name: 'Bottom nav',
            email: `bottom-nav-${language}-${Date.now()}@example.test`,
            acceptTerms: true,
            password,
            role: 'INDEPENDENT',
            language,
          },
        })
      ).ok(),
    ).toBeTruthy();
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/app/dashboard');
      const nav = page.getByRole('navigation', { name: he ? 'ניווט ראשי' : 'Main navigation' });
      await expect(nav).toBeVisible();
      const tab = (name: string) => nav.getByRole('button', { name, exact: true });
      await expect(tab(he ? 'בית' : 'Home')).toHaveAttribute('aria-current', 'page');
      await page.screenshot({ path: `${shots}/bottom-nav-home-${language}.png` });

      await tab(he ? 'תזונה' : 'Nutrition').click();
      await expect(page).toHaveURL(/\/app\/nutrition/);
      await expect(tab(he ? 'תזונה' : 'Nutrition')).toHaveAttribute('aria-current', 'page');

      // "More" opens the full menu drawer.
      await tab(he ? 'עוד' : 'More').click();
      await expect(page.locator('.sidebar.open')).toBeVisible();
      await page.locator('.sidebar-scrim').click({ position: { x: 5, y: 5 } });
      await expect(page.locator('.sidebar.open')).toHaveCount(0);

      // Workout builder: its action bar stacks directly above the tab bar.
      await tab(he ? 'אימונים' : 'Workouts').click();
      await expect(page).toHaveURL(/\/app\/workouts/);
      await page.goto('/app/builder');
      await expect(page.locator('.wb-actionbar')).toBeVisible();
      await expect(tab(he ? 'אימונים' : 'Workouts')).toHaveAttribute('aria-current', 'page');
      await sitsAboveNav(page, '.wb-actionbar');
      await page.screenshot({ path: `${shots}/bottom-nav-builder-${language}.png` });

      // Live workout: the rest timer floats above the tab bar too.
      const saved = await page.request.post('/api/programs/save', {
        data: {
          name: 'Bottom nav workout',
          days: '1,3,5',
          exercises: [{ exerciseId: 'row', sets: 2, reps: 10, weight: 5, rest: 90 }],
        },
      });
      expect(saved.ok()).toBeTruthy();
      const started = await page.request.post('/api/workouts/start', {
        data: { programId: (await saved.json()).id },
      });
      const workout = await started.json();
      await page.goto(`/app/active?session=${workout.id}`);
      await page.locator('.set-row').first().locator('.set-check').click();
      // The first logged set is a personal record; close the celebration.
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: he ? 'ממשיכים' : 'Keep going', exact: true })
        .click();
      await expect(page.locator('.rest-timer')).toBeVisible();
      await sitsAboveNav(page, '.rest-timer');
      await expect(nav.locator('.bottom-nav-live')).toHaveCount(1);
      await page.screenshot({ path: `${shots}/bottom-nav-active-${language}.png` });
      // From another page, the workouts tab leads back to the running session.
      await tab(he ? 'בית' : 'Home').click();
      await tab(he ? 'אימונים' : 'Workouts').click();
      await expect(page).toHaveURL(/\/app\/active/);

      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
      // Desktop keeps the sidebar and has no tab bar.
      await page.setViewportSize({ width: 1440, height: 1000 });
      await expect(page.locator('.bottom-nav')).toBeHidden();
    } finally {
      await page.request.post('/api/account/delete', { data: { password } });
    }
  });
}
