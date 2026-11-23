import { expect, test } from '@playwright/test';

for (const language of ['en', 'he'] as const) {
  test(`coach contact is required, editable and available to clients in ${language}`, async ({
    browser,
  }) => {
    const coach = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const client = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const suffix = `${language}-${Date.now()}`;
    const email = `contact-coach-${suffix}@example.test`;
    const clientEmail = `contact-client-${suffix}@example.test`;
    const password = 'Coach-Contact-Test-2026!';
    const details = { name: 'Contact coach', email, password, language };
    try {
      for (const path of ['auth/register', 'auth/coach/register']) {
        for (const phone of [undefined, '', '0501234567', '+972123<script>']) {
          expect(
            (
              await coach.request.post(`/api/${path}`, {
                data: { ...details, role: 'COACH', phone },
              })
            ).status(),
          ).toBe(400);
        }
      }
      expect(
        (
          await coach.request.post('/api/auth/coach/register', {
            data: { ...details, phone: '+972 (50) 123-4567' },
          })
        ).ok(),
      ).toBeTruthy();
      expect((await (await coach.request.get('/api/state')).json()).user.phone).toBe(
        '+972501234567',
      );
      const page = await coach.newPage();
      await page.goto('/app/settings');
      await expect(page.locator('input[type=email]')).toHaveValue(email);
      await page.locator('[name=phone]').fill('0044 7700 900123');
      const saved = page.waitForResponse(
        (r) => r.url().endsWith('/api/profile') && r.request().method() === 'POST',
      );
      await page.locator('form button[type=submit]').click();
      expect((await saved).ok()).toBeTruthy();
      await page.reload();
      await expect(page.locator('[name=phone]')).toHaveValue('+447700900123');

      expect(
        (
          await client.request.post('/api/auth/user/register', {
            data: { name: 'Contact client', email: clientEmail, password, language },
          })
        ).ok(),
      ).toBeTruthy();
      expect(
        (await coach.request.post('/api/clients/invite', { data: { email: clientEmail } })).ok(),
      ).toBeTruthy();
      const { relationships } = await (await client.request.get('/api/state')).json();
      expect(
        (
          await client.request.post('/api/clients/respond', {
            data: { id: relationships[0].id, accept: true },
          })
        ).ok(),
      ).toBeTruthy();
      const clientPage = await client.newPage();
      for (const path of ['/app', '/app/messages', '/app/settings']) {
        await clientPage.goto(path);
        await expect(clientPage.locator(`a[href="mailto:${email}"]`)).toBeVisible();
        await expect(clientPage.locator('a[href="tel:+447700900123"]')).toBeVisible();
        await expect(clientPage.locator('a[href="https://wa.me/447700900123"]')).toBeVisible();
      }
      expect(
        (
          await client.request.post('/api/clients/revoke', { data: { id: relationships[0].id } })
        ).ok(),
      ).toBeTruthy();
      await clientPage.goto('/app');
      await expect(clientPage.locator('.coach-contact')).toHaveCount(0);
    } finally {
      for (const context of [coach, client]) {
        await context.request.post('/api/account/delete', { data: { password } });
        await context.close();
      }
    }
  });
}
