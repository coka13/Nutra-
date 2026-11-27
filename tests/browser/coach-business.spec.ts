import { test, expect } from '@playwright/test';
import { grantCoachPlan } from './coach-plan';

test('coach packages, balances, payment privacy and trainee activity placement', async ({
  browser,
}) => {
  test.setTimeout(60000);
  const coach = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const client = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const other = await browser.newContext();
  const password = 'Business-Test-2026!';
  const suffix = Date.now();
  try {
    for (const [name, role, context] of [
      ['Coach', 'COACH', coach],
      ['Client', 'INDEPENDENT', client],
      ['Other', 'COACH', other],
    ] as const) {
      const response = await context.request.post('/api/auth/register', {
        data: {
          name,
          role,
          email: `business-${name}-${suffix}@example.test`,
          phone: '+972501234567',
          acceptTerms: true,
          healthConsent: true,
          password,
          language: 'he',
        },
      });
      expect(response.ok()).toBeTruthy();
      if (role === 'COACH') await grantCoachPlan(`business-${name}-${suffix}@example.test`);
    }
    expect(
      (
        await coach.request.post('/api/clients/invite', {
          data: { email: `business-Client-${suffix}@example.test` },
        })
      ).ok(),
    ).toBeTruthy();
    const state = await (await client.request.get('/api/state')).json();
    const link = state.relationships[0];
    expect(
      (
        await client.request.post('/api/clients/respond', { data: { id: link.id, accept: true } })
      ).ok(),
    ).toBeTruthy();
    expect((await client.request.get('/api/coach-business')).status()).toBe(403);
    const packageData = {
      action: 'package',
      relationshipId: link.id,
      date: '2026-11-01',
      size: 4,
      price: 100000,
    };
    expect((await other.request.post('/api/coach-business', { data: packageData })).status()).toBe(
      403,
    );
    expect(
      (
        await coach.request.post('/api/coach-business', { data: { ...packageData, size: 5 } })
      ).status(),
    ).toBe(400);
    expect(
      (await coach.request.post('/api/coach-business', { data: packageData })).ok(),
    ).toBeTruthy();
    const getPackage = async () =>
      (await (await coach.request.get('/api/coach-business')).json()).packages[0];
    const pack = await getPackage();
    expect((await other.request.get('/api/coach-business')).ok()).toBeTruthy();
    expect((await (await other.request.get('/api/coach-business')).json()).packages).toEqual([]);
    const training = {
      action: 'training',
      packageId: pack.id,
      date: '2026-11-02',
      status: 'COMPLETED',
      notes: 'Session notes',
    };
    expect((await other.request.post('/api/coach-business', { data: training })).status()).toBe(
      403,
    );
    for (let i = 0; i < 2; i++)
      expect(
        (await coach.request.post('/api/coach-business', { data: training })).ok(),
      ).toBeTruthy();
    const notifications = (await (await coach.request.get('/api/state')).json()).notifications;
    expect(notifications.filter((n: { key: string }) => n.key === 'twoSessionsLeft')).toHaveLength(
      1,
    );
    const session = (await getPackage()).sessions[0];
    for (const status of ['CANCELLED', 'COMPLETED'])
      expect(
        (
          await coach.request.post('/api/coach-business', {
            data: { action: 'status', packageId: pack.id, trainingId: session.id, status },
          })
        ).ok(),
      ).toBeTruthy();
    expect(
      (await (await coach.request.get('/api/state')).json()).notifications.filter(
        (n: { key: string }) => n.key === 'twoSessionsLeft',
      ),
    ).toHaveLength(1);
    const payment = {
      action: 'receipt',
      packageId: pack.id,
      date: '2026-11-02',
      amount: 25000,
      method: 'cash',
      notes: 'Partial payment',
    };
    expect((await coach.request.post('/api/coach-business', { data: payment })).ok()).toBeTruthy();
    expect(
      (
        await coach.request.post('/api/coach-business', { data: { ...payment, amount: 100000 } })
      ).status(),
    ).toBe(400);
    expect(
      (
        await coach.request.post('/api/coach-business', {
          data: payment,
          headers: { Origin: 'https://foreign.example' },
        })
      ).status(),
    ).toBe(403);
    const page = await coach.newPage();
    await page.goto('/app/packages');
    await expect(page.getByRole('heading', { name: 'חבילות', exact: true })).toBeVisible();
    await expect(page.locator('.business-cards')).toContainText('אימונים שנותרו: 2');
    await page.getByRole('button', { name: 'תיעוד אימון', exact: true }).last().click();
    await page.getByRole('dialog').locator('[name=date]').fill('2026-11-03');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'שמירת שינויים', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.business-cards')).toContainText('אימונים שנותרו: 1');
    await page.goto('/app/trainingLog');
    await expect(page.locator('.business-cards .panel')).toHaveCount(3);
    await page.goto('/app/clientPayments');
    await expect(page.getByRole('heading', { name: 'תשלומי מתאמנים', exact: true })).toBeVisible();
    await expect(page.locator('.business-cards').first()).toContainText('250.00');
    await page.goto('/app/businessReports');
    await expect(page.getByRole('heading', { name: 'דוח עסקי חודשי', exact: true })).toBeVisible();
    await expect(page.locator('.business-table tbody tr')).toHaveCount(1);
    await expect(page.locator('.business-table tbody')).toContainText('750.00');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'ייצוא CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(/business-.*\.csv/);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({ path: 'test-results/coach-business-mobile.png', fullPage: true });
    // Used up packages cannot be overdrawn.
    expect((await coach.request.post('/api/coach-business', { data: training })).ok()).toBeTruthy();
    expect((await coach.request.post('/api/coach-business', { data: training })).status()).toBe(
      409,
    );
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    expect(
      (
        await client.request.post('/api/activity', {
          data: {
            action: 'sync',
            source: 'apple-health',
            date: day,
            steps: 4321,
            activeCalories: 240,
            distanceKm: 2,
            activities: [],
          },
        })
      ).ok(),
    ).toBeTruthy();
    const trainee = await client.newPage();
    await trainee.goto('/app/nutrition');
    await expect(trainee.locator('.nutrition-burned')).toContainText('240');
    await trainee.screenshot({ path: 'test-results/trainee-nutrition-mobile.png', fullPage: true });
    await trainee.getByRole('button', { name: 'צעדים ופעילות', exact: true }).last().click();
    await expect(trainee.locator('.activity-summary')).toContainText('4,321');
  } finally {
    for (const context of [coach, client, other]) {
      await context.request.post('/api/account/delete', { data: { password } });
      await context.close();
    }
  }
});
