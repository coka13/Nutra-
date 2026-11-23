import { expect, test } from '@playwright/test';

for (const language of ['en', 'he'] as const) {
  const other = language === 'he' ? 'en' : 'he';
  const direction = language === 'he' ? 'rtl' : 'ltr';

  test(`public navigation renders the selected ${language} language before hydration`, async ({
    page,
    browser,
  }) => {
    await page.goto('/');
    // Switch both ways so each case explicitly sets its preference.
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    if (language === 'en') await page.getByRole('button', { name: 'שפה', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await page.context().cookies()).find((cookie) => cookie.name === 'nutri-language')
            ?.value,
      )
      .toBe(language);

    const context = await browser.newContext({
      storageState: await page.context().storageState(),
      javaScriptEnabled: false,
    });
    try {
      const rendered = await context.newPage();
      for (const path of [
        '/features',
        '/pricing',
        '/auth',
        '/auth/user/login',
        '/auth/coach/register',
      ]) {
        await rendered.goto(path);
        await expect(rendered.locator('html')).toHaveAttribute('lang', language);
        await expect(rendered.locator('html')).toHaveAttribute('dir', direction);
        await expect(
          rendered.getByRole('button', {
            name: language === 'he' ? 'שפה' : 'Language',
            exact: true,
          }),
        ).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });

  test(`sign-in keeps selected ${language} across workspace pages and logout`, async ({ page }) => {
    const email = `language-${language}-${Date.now()}@example.test`;
    const password = 'Language-Test-492!';
    const registered = await page.request.post('/api/auth/user/register', {
      data: { email, password, name: 'Language test', language: other },
    });
    expect(registered.ok()).toBeTruthy();
    await page.request.post('/api/auth/logout', { data: { email } });
    try {
      await page.goto('/auth/user/login');
      await page.getByRole('button', { name: 'Language', exact: true }).click();
      if (language === 'en') await page.getByRole('button', { name: 'שפה', exact: true }).click();
      await page.locator('[name=email]').fill(email);
      await page.locator('[name=password]').fill(password);
      await page.locator('form button').click();
      await expect(page).toHaveURL(/\/app\/?$/);
      await expect(page.locator('.sidebar')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      const signedIn = await (await page.request.get('/api/auth/me')).json();
      expect(signedIn.user.language).toBe(language);

      for (const path of ['/app/nutrition', '/app/settings', '/app']) {
        await page.goto(path);
        await expect(page.locator('.sidebar')).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('lang', language);
        await expect(page.locator('html')).toHaveAttribute('dir', direction);
      }
      await page
        .getByRole('button', { name: language === 'he' ? 'שפה' : 'Language', exact: true })
        .click();
      await expect(page.locator('html')).toHaveAttribute('lang', other);
      await page
        .locator('.sidebar')
        .getByRole('button', { name: other === 'he' ? 'תזונה' : 'Nutrition', exact: true })
        .click();
      await expect(page.locator('html')).toHaveAttribute('lang', other);
      await page.reload();
      await expect(page.locator('.sidebar')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', other);
      await page.request.post('/api/auth/logout', { data: { email } });
      await page.goto('/auth');
      await expect(page.locator('html')).toHaveAttribute('lang', other);
    } finally {
      const signedIn = await page.request.post('/api/auth/user/login', {
        data: { email, password },
      });
      if (signedIn.ok()) await page.request.post('/api/account/delete', { data: { password } });
    }
  });

  test(`demo entry keeps the selected ${language} language`, async ({ page }) => {
    const email = `demo-language-${language}-${Date.now()}@example.test`;
    const demo = await page.request.post('/api/auth/demo', { data: { email } });
    expect(demo.ok()).toBeTruthy();
    const original = (await demo.json()).user.language;
    try {
      await page.request.post('/api/preferences', { data: { language: other } });
      await page.request.post('/api/auth/logout', { data: { email } });
      await page.goto('/login');
      await page.getByRole('button', { name: 'Language', exact: true }).click();
      if (language === 'en') await page.getByRole('button', { name: 'שפה', exact: true }).click();
      await page
        .getByRole('button', {
          name: language === 'he' ? 'לסביבת ההדגמה' : 'Explore the demo',
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(/\/app\/?$/);
      await expect(page.locator('.sidebar')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await page.reload();
      await expect(page.locator('.sidebar')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', language);
    } finally {
      await page.request.post('/api/preferences', { data: { language: original } });
      await page.request.post('/api/auth/logout', { data: { email } });
    }
  });
}
