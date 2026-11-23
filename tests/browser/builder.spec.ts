import { expect, test } from '@playwright/test';

for (const language of ['en', 'he'] as const) {
  test(`builder search scrolls the page and supports adding, expanding and saving in ${language}`, async ({
    page,
  }) => {
    const he = language === 'he';
    const password = 'Builder-Layout-2026!';
    expect(
      (
        await page.request.post('/api/auth/register', {
          data: {
            name: 'Builder layout',
            email: `builder-${language}-${Date.now()}@example.test`,
            password,
            role: 'INDEPENDENT',
            language,
          },
        })
      ).ok(),
    ).toBeTruthy();
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/app/builder');
      const search = page.getByRole('searchbox', {
        name: he ? 'חיפוש תרגילים…' : 'Search exercises…',
      });
      await expect(search).toBeVisible();
      await search.fill('press');
      await page.locator('.builder-library > select').selectOption('chest');
      const group = page.locator('.builder-muscle-group').first();
      await expect(group.locator('.library-add-row')).toHaveCount(8);
      expect(
        await page
          .locator('.builder-library')
          .evaluate((node) => ['auto', 'scroll'].includes(getComputedStyle(node).overflowY)),
      ).toBe(false);
      expect(
        await group.evaluate((node) =>
          ['auto', 'scroll'].includes(getComputedStyle(node).overflowY),
        ),
      ).toBe(false);
      await search.scrollIntoViewIfNeeded();
      const initialScroll = await page.evaluate(() => window.scrollY);
      await search.hover();
      await page.mouse.wheel(0, 300);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialScroll);
      await group
        .getByRole('button', { name: he ? 'הצגת תרגילים נוספים' : 'Show more exercises' })
        .click();
      await expect(group.locator('.library-add-row')).toHaveCount(20);
      await page.locator('.builder-library > select').selectOption('all');
      await search.fill('preacher chair');
      const picks = page.locator('.library-add-row');
      const firstName = await picks.first().locator('strong').innerText();
      await picks.first().click();
      const tray = page.locator('.builder-selection-tray');
      await expect(tray).toBeVisible();
      await expect(tray.locator('strong')).toHaveText(firstName);
      expect(
        await tray.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        }),
      ).toBe(true);
      const secondName = await picks.nth(1).locator('strong').innerText();
      await picks.nth(1).click();
      await expect(tray.locator('strong')).toHaveText(secondName);
      await expect(tray.locator('.builder-tray-count')).toHaveText('2');
      await expect(page.locator('.builder-exercise')).toHaveCount(2);
      await expect(picks.first()).toBeDisabled();
      await expect(picks.first().locator('.builder-add-icon')).toHaveClass(/is-added/);
      const pickerScroll = await page.evaluate(() => window.scrollY);
      await tray.getByRole('button').click();
      const review = page.getByRole('dialog');
      await expect(review.locator('.builder-review-exercise')).toHaveCount(2);
      await expect(review).toContainText(firstName);
      await expect(review).toContainText(secondName);
      await review
        .locator('.builder-review-exercise')
        .first()
        .getByLabel(he ? 'סטים' : 'Sets', { exact: true })
        .fill('4');
      await page.screenshot({
        path: `test-results/builder-selection-${language}.png`,
        fullPage: true,
      });
      await review
        .getByRole('button', {
          name: he ? 'המשך בחירת תרגילים' : 'Keep choosing exercises',
          exact: true,
        })
        .click();
      await expect(review).toHaveCount(0);
      await expect(search).toHaveValue('preacher chair');
      expect(await page.evaluate(() => window.scrollY)).toBe(pickerScroll);
      await page.getByLabel(he ? 'שם' : 'Name', { exact: true }).fill('Builder layout workout');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
      await page.screenshot({
        path: `test-results/builder-mobile-${language}.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.screenshot({
        path: `test-results/builder-desktop-${language}.png`,
        fullPage: true,
      });
      const saving = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/programs/save') && response.request().method() === 'POST',
      );
      await page
        .getByRole('button', { name: he ? 'שמירת שינויים' : 'Save changes', exact: true })
        .click();
      const saved = await saving;
      expect(saved.ok()).toBeTruthy();
      expect(saved.request().postDataJSON().exercises[0].sets).toBe(4);
      await expect(
        page.getByRole('heading', { name: 'Builder layout workout', exact: true }),
      ).toBeVisible();
    } finally {
      await page.request.post('/api/account/delete', { data: { password } });
    }
  });
}
