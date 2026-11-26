import { expect, test } from '@playwright/test';

const shortPublicPages = [
  '/',
  '/auth',
  '/auth/user/login',
  '/auth/user/register',
  '/auth/user/recover',
  '/auth/coach/login',
  '/auth/coach/register',
  '/admin/login',
];

async function expectViewportFit(page: import('@playwright/test').Page) {
  const dimensions = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    width: document.documentElement.scrollWidth,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  }));
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.viewportHeight);
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewportWidth);
}

for (const language of ['en', 'he'] as const) {
  test(`short public pages fit a compact phone viewport in ${language}`, async ({
    context,
    page,
  }) => {
    await context.addCookies([
      { name: 'nutri-language', value: language, url: 'http://localhost:3000' },
    ]);
    await page.setViewportSize({ width: 360, height: 640 });

    for (const path of shortPublicPages) {
      await page.goto(path);
      await expect(page.locator('body')).toBeVisible();
      await expectViewportFit(page);
    }
  });
}

test('short app pages fill the viewport while long content remains scrollable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const login = await page.request.post('/api/auth/demo', { data: { language: 'en' } });
  expect(login.ok()).toBeTruthy();

  for (const path of ['/app/messages', '/app/recipes']) {
    await page.goto(path);
    await expect(page.locator('.main-content')).toBeVisible();
    await expectViewportFit(page);
  }

  await page.goto('/app/library');
  await expect(page.locator('.main-content')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight))
    .toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator('.app-footer')).toBeVisible();
});
