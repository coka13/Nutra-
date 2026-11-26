import { test, expect } from '@playwright/test';

test('library cards align on mobile and desktop and reuse loaded pages', async ({ page }) => {
  const password = 'Catalog-Layout-2026!';
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: {
          name: 'Catalog Layout',
          email: `catalog-layout-${Date.now()}@example.test`,
          acceptTerms: true,
          password,
          role: 'INDEPENDENT',
          language: 'he',
        },
      })
    ).ok(),
  ).toBeTruthy();
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/exercise-catalog?')) requests.push(request.url());
  });
  // Library previews must load even when the external media server is unavailable.
  await page.route('https://api.smartworkout.app/**', (route) => route.abort());
  try {
    await page.goto('/app/library');
    await expect(page.locator('.catalog-card')).toHaveCount(36);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const grid = page.locator('.catalog-muscle-group .exercise-grid').first();
      await grid.scrollIntoViewIfNeeded();
      const first = grid.locator('.catalog-card').nth(0);
      const second = grid.locator('.catalog-card').nth(1);
      for (const selector of ['.catalog-thumbnail', 'h3']) {
        const a = await first.locator(selector).boundingBox();
        const b = await second.locator(selector).boundingBox();
        expect(a).not.toBeNull();
        expect(b).not.toBeNull();
        expect(Math.abs(a!.y - b!.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(a!.width - b!.width)).toBeLessThanOrEqual(1);
      }
      await expect(first).toHaveCSS('text-align', 'center');
      await expect
        .poll(() => first.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
      await page.screenshot({
        path: `test-results/catalog-aligned-${width}.png`,
        animations: 'disabled',
      });
    }
    const initial = await page.locator('.catalog-card h3').first().textContent();
    await page.getByRole('button', { name: 'עמוד הבא', exact: true }).click();
    await expect(page.locator('.catalog-section')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.catalog-card h3').first()).not.toHaveText(initial!);
    await page.getByRole('button', { name: 'עמוד קודם', exact: true }).click();
    await expect(page.locator('.catalog-card h3').first()).toHaveText(initial!);
    expect(new Set(requests).size).toBe(requests.length);
    expect(requests.filter((url) => new URL(url).searchParams.get('offset') === '0')).toHaveLength(
      0,
    );
  } finally {
    await page.request.post('/api/account/delete', { data: { password } });
  }
});
