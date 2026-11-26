import { test, expect } from '@playwright/test';

test('library is preloaded before navigation and every card animates without media APIs', async ({
  page,
}) => {
  test.setTimeout(60000);
  const password = 'Catalog-Preload-2026!';
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: {
          name: 'Preload Test',
          email: `preload-${Date.now()}@example.test`,
          acceptTerms: true,
          password,
          role: 'INDEPENDENT',
          language: 'en',
        },
      })
    ).ok(),
  ).toBeTruthy();
  try {
    const catalog = await (await page.request.get('/api/exercise-catalog')).json();
    const expected = new Set<string>(
      catalog.results.map((row: { animation: string }) => row.animation),
    );
    const warmed = new Set<string>();
    const apiRequests: string[] = [];
    page.on('requestfinished', async (request) => {
      const path = new URL(request.url()).pathname;
      if (expected.has(path) && (await request.response())?.ok()) warmed.add(path);
    });
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) apiRequests.push(url.pathname + url.search);
    });
    await page.route('https://api.smartworkout.app/**', (route) => route.abort());
    await page.goto('/app');
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect.poll(() => warmed.size, { timeout: 30000 }).toBe(expected.size);
    // Stop the APIs that previously blocked navigation and on-demand GIF generation.
    await page.route('**/api/library', (route) => route.abort());
    await page.route('**/api/state?**', (route) => route.abort());
    await page.route('**/api/exercises/**', (route) => route.abort());
    const before = apiRequests.length;
    const start = Date.now();
    await page
      .locator('.sidebar')
      .getByRole('button', { name: 'Exercise library', exact: true })
      .click();
    await expect(page.locator('.catalog-card')).toHaveCount(36);
    await expect
      .poll(() =>
        page
          .locator('.catalog-thumbnail')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                image instanceof HTMLImageElement &&
                image.naturalWidth > 0 &&
                /\/exercise-gifs\/[^/]+\.gif$/.test(image.src),
            ),
          ),
      )
      .toBeTruthy();
    const elapsed = Date.now() - start;
    console.log(`Preloaded library navigation with 36 running GIFs: ${elapsed} ms`);
    expect(elapsed).toBeLessThan(2000);
    expect(
      apiRequests
        .slice(before)
        .filter((url) => /^\/api\/(library|state|exercises)(\?|\/|$)/.test(url)),
    ).toHaveLength(0);
    await page.screenshot({ path: 'test-results/catalog-autoplay.png', animations: 'disabled' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.catalog-thumbnail').first()).toHaveAttribute(
      'src',
      /^\/exercise-thumbnails\/.*\.png$/,
    );
  } finally {
    await page.request.post('/api/account/delete', { data: { password } });
  }
});
