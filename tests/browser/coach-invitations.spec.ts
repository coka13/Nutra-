import { expect, test } from '@playwright/test';

for (const language of ['en', 'he'] as const) {
  test(`homepage shows incoming coach invitations and supports accept and decline in ${language}`, async ({
    browser,
  }) => {
    const he = language === 'he';
    const client = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const coach = await browser.newContext();
    const otherCoach = await browser.newContext();
    const password = 'Coach-Invitations-2026!';
    const suffix = `${language}-${Date.now()}`;
    const email = `invited-${suffix}@example.test`;
    try {
      const registered = await client.request.post('/api/auth/register', {
        data: { name: 'Invited client', email, password, role: 'INDEPENDENT', language },
      });
      expect(registered.ok()).toBeTruthy();
      const { user } = await registered.json();
      for (const [context, name] of [
        [coach, 'Coach Riley'],
        [otherCoach, 'Coach Jordan'],
      ] as const) {
        expect(
          (
            await context.request.post('/api/auth/register', {
              data: {
                name,
                email: `${name.replaceAll(' ', '-').toLowerCase()}-${suffix}@example.test`,
                password,
                role: 'COACH',
                phone: '+972501234567',
                language,
              },
            })
          ).ok(),
        ).toBeTruthy();
      }
      const page = await client.newPage();
      await page.clock.install();
      await page.goto('/app');
      await expect(page.locator('.stats-grid')).toBeVisible();
      await expect(page.locator('.coach-invitations')).toHaveCount(0);
      for (const context of [coach, otherCoach])
        expect(
          (await context.request.post('/api/clients/invite', { data: { email } })).ok(),
        ).toBeTruthy();
      expect((await coach.request.get(`/api/state?userId=${user.id}`)).status()).toBe(403);
      // Invitations arriving while the homepage is open appear on its existing refresh cycle.
      await page.clock.runFor(21000);
      const invitations = page.getByRole('region', {
        name: he ? 'הזמנות ממאמנים' : 'Coach invitations',
      });
      await expect(invitations).toBeVisible();
      await expect(invitations.locator('.coach-invitation-card')).toHaveCount(2);
      const riley = invitations.getByRole('article', { name: 'Coach Riley', exact: true });
      const jordan = invitations.getByRole('article', { name: 'Coach Jordan', exact: true });
      await expect(riley).toContainText(`coach-riley-${suffix}@example.test`);
      await expect(riley).toContainText(he ? 'אישור יאפשר' : 'Accepting lets');
      expect(
        await invitations.evaluate((node) => node.getBoundingClientRect().top < innerHeight),
      ).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `test-results/coach-invitations-${language}.png`,
        fullPage: true,
      });
      const acceptLabel = he ? 'אישור ושיתוף רשומות' : 'Accept & share records';
      await page.route('**/api/clients/respond', (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'offline' }),
        }),
      );
      await riley.getByRole('button', { name: acceptLabel, exact: true }).click();
      await expect(riley.getByRole('alert')).toBeVisible();
      await expect(riley).toBeVisible();
      await page.unroute('**/api/clients/respond');
      await riley.getByRole('button', { name: acceptLabel, exact: true }).click();
      await expect(riley).toHaveCount(0);
      await expect(jordan).toBeVisible();
      expect((await coach.request.get(`/api/state?userId=${user.id}`)).ok()).toBeTruthy();
      await jordan.getByRole('button', { name: he ? 'דחייה' : 'Decline', exact: true }).click();
      await expect(invitations).toHaveCount(0);
      expect((await otherCoach.request.get(`/api/state?userId=${user.id}`)).status()).toBe(403);
      await page.reload();
      await expect(page.locator('.stats-grid')).toBeVisible();
      await expect(invitations).toHaveCount(0);
      const state = await (await client.request.get('/api/state')).json();
      expect(
        state.relationships.find(
          (item: { coach: { name: string } }) => item.coach.name === 'Coach Riley',
        ).status,
      ).toBe('ACTIVE');
      expect(
        state.relationships.find(
          (item: { coach: { name: string } }) => item.coach.name === 'Coach Jordan',
        ).status,
      ).toBe('DECLINED');
    } finally {
      for (const context of [client, coach, otherCoach]) {
        await context.request.post('/api/account/delete', { data: { password } });
        await context.close();
      }
    }
  });
}
