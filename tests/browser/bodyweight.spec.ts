import { expect, test } from '@playwright/test';
import sharp from 'sharp';

for (const language of ['en', 'he'] as const) {
  test(`daily bodyweight, optional photos and connected coach access in ${language}`, async ({
    browser,
  }) => {
    const client = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const coach = await browser.newContext();
    const suffix = `${Date.now()}-${language}`;
    const email = `weight-${suffix}@example.test`;
    const password = 'Bodyweight-Test21!';
    let userId = '';
    try {
      for (const [context, role, accountEmail] of [
        [client, 'INDEPENDENT', email],
        [coach, 'COACH', `coach-${suffix}@example.test`],
      ] as const) {
        const response = await context.request.post('/api/auth/register', {
          data: {
            name: role === 'COACH' ? 'Weight Coach' : 'Weight Client',
            email: accountEmail,
            acceptTerms: true,
            healthConsent: true,
            password,
            role,
            phone: role === 'COACH' ? '+972501234567' : undefined,
            language,
          },
        });
        expect(response.ok(), await response.text()).toBeTruthy();
        if (context === client) userId = (await response.json()).user.id;
      }
      const target = `/api/progress/bodyweight?userId=${userId}`;
      expect((await coach.request.get(target)).status()).toBe(403);
      await coach.request.post('/api/clients/invite', { data: { email } });
      const { relationships } = await (await client.request.get('/api/state')).json();
      expect((await coach.request.get(target)).status()).toBe(403);
      await client.request.post('/api/clients/respond', {
        data: { id: relationships[0].id, accept: true },
      });

      const page = await client.newPage();
      await page.goto('/app/progress');
      const overview = page.getByRole('region', {
        name: language === 'he' ? 'סקירת משקל' : 'Weight overview',
      });
      const updateButton = overview.getByRole('button', {
        name: language === 'he' ? 'עדכון משקל גוף' : 'Update bodyweight',
        exact: true,
      });
      const weightDialog = page.getByRole('dialog', {
        name: language === 'he' ? 'עדכון משקל גוף' : 'Update bodyweight',
      });
      const panel = page.getByRole('region', {
        name: language === 'he' ? 'משקל גוף יומי' : 'Daily bodyweight',
      });
      await expect(panel).toHaveCount(0);
      await expect(overview.locator('.weight-month-stats')).toHaveCount(0);
      await updateButton.click();
      await expect(weightDialog).toBeVisible();
      await expect(panel.locator('[name=value]')).toBeFocused();
      await panel.locator('[name=date]').fill('2026-11-20');
      await panel.locator('[name=value]').fill('75.5');
      await panel.locator('summary').click();
      await panel.locator('[name=note]').fill('Morning check-in');
      await panel.locator('button[type=submit]').click();
      await expect(weightDialog).toHaveCount(0);
      await expect(overview.getByRole('status')).toHaveText(
        language === 'he' ? 'משקל הגוף נשמר.' : 'Bodyweight saved.',
      );
      expect(await (await client.request.get('/api/progress/bodyweight')).json()).toMatchObject([
        { date: '2026-11-20', value: 75.5, photos: [] },
      ]);
      await expect(overview.locator('.weight-hero-value')).toContainText('75.5');
      await overview.locator('input[type=month]').fill('2026-11');
      await expect(overview.locator('.weight-month-chart')).toBeVisible();
      await overview.locator('input[type=month]').fill('2026-10');
      await expect(overview.locator('.weight-month-empty')).toBeVisible();
      await expect(overview.locator('.weight-hero-value')).toContainText('75.5');
      await overview.locator('input[type=month]').fill('2026-11');

      const photo = await sharp({
        create: { width: 30, height: 40, channels: 3, background: '#27836b' },
      })
        .jpeg()
        .toBuffer();
      await updateButton.click();
      await expect(panel.locator('[name=value]')).toHaveValue('75.5');
      await panel.locator('[name=date]').fill('2026-11-20');
      await panel.locator('[name=value]').fill('75.2');
      await panel.locator('summary').click();
      await panel.locator('[name=photos]').setInputFiles([
        { name: 'front.jpg', mimeType: 'image/jpeg', buffer: photo },
        { name: 'side.jpg', mimeType: 'image/jpeg', buffer: photo },
      ]);
      await panel.locator('button[type=submit]').click();
      await expect(weightDialog).toHaveCount(0);
      await expect(overview.locator('.weight-hero-value')).toContainText('75.2');
      const gallery = page.locator('section.panel').filter({
        has: page.getByRole('heading', {
          name: language === 'he' ? 'תמונות מעקב' : 'Progress photos',
          exact: true,
        }),
      });
      await expect(gallery.locator('figure')).toHaveCount(2);
      await gallery.locator('figure img').first().scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          gallery
            .locator('figure img')
            .first()
            .evaluate((img: HTMLImageElement) => img.naturalWidth),
        )
        .toBe(30);
      let records = await (await coach.request.get(target)).json();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ value: 75.2, date: '2026-11-20' });
      expect(records[0].photos).toHaveLength(2);
      expect(
        (
          await client.request.post('/api/progress', {
            data: {
              kind: 'weight',
              value: 75.2,
              unit: 'kg',
              date: '2026-11-20',
              note: 'Morning check-in',
            },
          })
        ).ok(),
      ).toBeTruthy();
      const updated = await (await client.request.get('/api/progress/bodyweight')).json();
      expect(updated).toHaveLength(1);
      expect(updated[0].photos).toHaveLength(2);
      const photoUrl = `/api/progress/photos?userId=${userId}&id=${records[0].photos[0].id}`;
      expect((await coach.request.get(photoUrl)).ok()).toBeTruthy();

      // Invalid photo data must leave the weight and existing photos untouched.
      expect(
        (
          await client.request.post('/api/progress/bodyweight', {
            data: {
              value: 99,
              date: '2026-11-20',
              images: [Buffer.from('invalid image').toString('base64')],
            },
          })
        ).status(),
      ).toBe(400);
      expect(
        (
          await client.request.post('/api/progress/bodyweight', {
            data: { value: 0, date: '2026-11-20' },
          })
        ).status(),
      ).toBe(400);
      expect(
        (
          await client.request.post('/api/progress/bodyweight', {
            data: { value: 75, date: '2026-02-30' },
          })
        ).status(),
      ).toBe(400);
      records = await (await client.request.get('/api/progress/bodyweight')).json();
      expect(records[0].value).toBe(75.2);
      expect(records[0].photos).toHaveLength(2);

      const coachPage = await coach.newPage();
      await coachPage.goto('/app/clients');
      await coachPage
        .getByRole('button', { name: language === 'he' ? 'פרופיל מתאמן' : 'Client profile' })
        .click();
      const dialog = coachPage.locator('.client-profile');
      await dialog
        .getByRole('tab', { name: language === 'he' ? 'משקל' : 'Weight', exact: true })
        .click();
      const coachPanel = dialog.getByRole('region', {
        name: language === 'he' ? 'משקל גוף יומי' : 'Daily bodyweight',
      });
      await expect(coachPanel.locator('strong')).toContainText('75.2');
      await expect(coachPanel.locator('figure')).toHaveCount(2);
      await expect(coachPanel.locator('input')).toHaveCount(0);
      expect(
        (
          await coach.request.post('/api/progress/photos/delete', {
            data: { id: records[0].photos[0].id },
          })
        ).status(),
      ).toBe(404);

      await page.reload();
      await expect(panel).toHaveCount(0);
      await updateButton.click();
      await expect(panel.locator('[name=value]')).toHaveValue('75.2');
      await page.keyboard.press('Escape');
      await expect(weightDialog).toHaveCount(0);
      await expect(updateButton).toBeFocused();
      await expect(gallery.locator('figure')).toHaveCount(2);
      await gallery.locator('figure button').first().click();
      await gallery
        .locator('figure')
        .first()
        .getByRole('button', {
          name: language === 'he' ? 'מחיקה' : 'Delete',
          exact: true,
        })
        .click();
      await expect(gallery.locator('figure')).toHaveCount(1);
      await client.request.post('/api/clients/revoke', { data: { id: relationships[0].id } });
      expect((await coach.request.get(target)).status()).toBe(403);
      expect((await coach.request.get(photoUrl)).status()).toBe(403);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
    } finally {
      await client.request.post('/api/account/delete', { data: { password } });
      await coach.request.post('/api/account/delete', { data: { password } });
      await client.close();
      await coach.close();
    }
  });
}
