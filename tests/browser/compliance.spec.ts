import { expect, test } from '@playwright/test';

test('cookie banner records a choice and can be reopened', async ({ browser }) => {
  // A fresh visitor, without the preset choice from playwright.config.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const page = await context.newPage();
    await page.goto('/features');
    const banner = page.getByRole('region', { name: 'Cookies' });
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Necessary only' }).click();
    await expect(banner).toBeHidden();
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'fitura-cookies')?.value).toBe('necessary');
    await page.reload();
    await expect(banner).toBeHidden();
    await page.getByRole('button', { name: 'Cookie settings' }).click();
    await expect(banner).toBeVisible();
  } finally {
    await context.close();
  }
});

test('accessibility menu applies settings and keeps them after reload', async ({ page }) => {
  await page.goto('/privacy');
  await page.getByRole('button', { name: 'Accessibility' }).click();
  const panel = page.getByRole('dialog', { name: 'Accessibility' });
  await panel.getByRole('button', { name: 'High contrast' }).click();
  await panel.getByRole('button', { name: 'Text size 130%' }).click();
  await expect(page.locator('html')).toHaveClass(/a11y-contrast/);
  await expect(page.locator('html')).toHaveClass(/a11y-zoom-2/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/a11y-contrast/);
  await page.getByRole('button', { name: 'Accessibility' }).click();
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('html')).not.toHaveClass(/a11y-contrast|a11y-zoom/);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('trainees without health-data consent are asked once in the app', async ({ page }) => {
  const response = await page.request.post('/api/auth/register', {
    data: {
      name: 'Consent Test',
      email: `consent-${Date.now()}@example.test`,
      password: 'Consent-Test-2026!',
      role: 'INDEPENDENT',
      language: 'en',
      // As older mobile builds send it: terms only, no health consent.
      acceptTerms: true,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  expect((await (await page.request.get('/api/state')).json()).consent).toEqual({
    terms: true,
    health: false,
  });
  expect(
    (await page.request.post('/api/account/consent', { data: { acceptTerms: true } })).status(),
  ).toBe(400);
  await page.goto('/app');
  const gate = page.getByRole('dialog', { name: 'Please review and confirm' });
  await expect(gate).toBeVisible();
  const accept = gate.getByRole('button', { name: 'Accept and continue' });
  await expect(accept).toBeDisabled();
  await gate.getByRole('checkbox').nth(0).check();
  await gate.getByRole('checkbox').nth(1).check();
  await accept.click();
  await expect(gate).toBeHidden();
  expect((await (await page.request.get('/api/state')).json()).consent).toEqual({
    terms: true,
    health: true,
  });
  await page.reload();
  await expect(gate).toBeHidden();
});
