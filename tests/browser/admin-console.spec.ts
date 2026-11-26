/**
 * Administration console in a real browser. Needs the server's DATABASE_URL and
 * ADMIN_ENCRYPTION_KEY in this process so it can provision a test administrator.
 */
import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { encryptSecret, generateTotpSecret, totpAt, totpStep } from '../../src/lib/admin/crypto';
import { hashPassword } from '../../src/lib/security';

try {
  // Same DATABASE_URL / ADMIN_ENCRYPTION_KEY as the server under test.
  process.loadEnvFile();
} catch {
  /* Variables may come from the environment. */
}

const PASSWORD = 'Browser-Admin-Password-7q';
const shots = process.env.ADMIN_SCREENSHOTS;

test('a Super Admin signs in with TOTP and works across sections in both languages and themes', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const db = new PrismaClient();
  const secret = generateTotpSecret();
  const email = `browser-${Date.now()}@admin.test`;
  await db.adminAccount.create({
    data: {
      email,
      name: 'Browser Admin',
      role: 'SUPER_ADMIN',
      passwordHash: hashPassword(PASSWORD),
      totpSecret: encryptSecret(secret),
      totpEnabledAt: new Date(),
      status: 'ACTIVE',
    },
  });
  try {
    // Direct URL access without a session lands on the sign-in page.
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
    await page.getByLabel('Code').fill(totpAt(secret, totpStep()));
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Registered users')).toBeVisible();
    await expect(page.locator('.recharts-surface').first()).toBeVisible();
    if (shots)
      await page
        .waitForTimeout(600)
        .then(() => page.screenshot({ path: `${shots}/admin-dashboard.png`, fullPage: true }));

    await page.getByRole('button', { name: 'Users', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await expect(page.locator('.adm-table tbody tr').first()).toBeVisible();
    await page.locator('.adm-table tbody tr').first().click();
    await expect(page.locator('.adm-drawer')).toBeVisible();
    await expect(page.getByText('Effective access')).toBeVisible();
    if (shots)
      await page
        .waitForTimeout(600)
        .then(() => page.screenshot({ path: `${shots}/admin-user-drawer.png` }));
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Features & config' }).click();
    await expect(page.getByRole('heading', { name: 'Features & config' })).toBeVisible();
    await page.getByRole('button', { name: 'System' }).click();
    await expect(page.getByText('Configuration checks')).toBeVisible();

    // Hebrew switches the whole console to right-to-left.
    await page.getByRole('button', { name: 'Language' }).click();
    await expect(page.locator('.adm')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'מערכת' })).toBeVisible();
    // Dark theme.
    await page.getByRole('button', { name: 'ערכת צבעים' }).click();
    await expect(page.locator('.adm')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'לוח בקרה' }).click();
    await expect(page.getByText('משתמשים רשומים')).toBeVisible();
    if (shots)
      await page
        .waitForTimeout(600)
        .then(() =>
          page.screenshot({ path: `${shots}/admin-dashboard-he-dark.png`, fullPage: true }),
        );

    // Phone width: no horizontal page scroll, menu opens off-canvas.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'תפריט' }).first().click();
    await expect(page.locator('.adm-shell.mobile-open')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    if (shots)
      await page
        .waitForTimeout(600)
        .then(() => page.screenshot({ path: `${shots}/admin-mobile-he.png` }));

    // Signing out ends access.
    await page.getByRole('button', { name: 'התנתקות' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    expect((await page.request.get('/api/console/auth/me')).status()).toBe(401);
  } finally {
    await db.$disconnect();
  }
});
