import { test, expect } from '@playwright/test';
test('demo dashboard, responsive RTL and persisted nutrition workflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/login');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await page.request.post('/api/preferences', { data: { language: 'en', theme: 'light' } });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('heading', { name: /Let’s make today count/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Nutrition', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nutrition diary', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Log food', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search foods…' }).fill('apple');
  await page.getByRole('button', { name: /Apple/ }).click();
  await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('150');
  await page.getByRole('button', { name: 'Add to diary' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Apple', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'יומן תזונה' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/nutrition-mobile-hebrew.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await page.getByRole('button', { name: 'פתיחת ניווט' }).click();
  await page.getByRole('button', { name: 'סקירה כללית', exact: true }).click();
  await expect(page.getByRole('heading', { name: /בואו נעשה משהו טוב היום/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard-mobile-hebrew.png', fullPage: true });
  await page.getByRole('button', { name: 'ערכת נושא', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: 'test-results/dashboard-mobile-dark.png', fullPage: true });
  await page.request.post('/api/preferences', { data: { language: 'en', theme: 'light' } });
  expect(errors).toEqual([]);
  const snapshot = await (await page.request.get('/api/state')).json();
  for (const meal of snapshot.meals.filter((m: { foodId: string }) => m.foodId === 'apple'))
    await page.request.post('/api/meals/delete', { data: { id: meal.id } });
});
test('register, onboard, build, log and recover an active workout after refresh', async ({
  page,
}) => {
  const email = `browser-${Date.now()}@example.test`;
  await page.goto('/register');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Jordan Test');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(/^Password/).fill('BrowserTestPassword!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.locator('[name=acceptTerms]').check();
  await page.locator('[name=healthConsent]').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to your next chapter.' })).toBeVisible();
  await page.getByLabel('I am 18 or older.').check();
  await page.getByRole('button', { name: 'Let’s get started', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Let’s make today count/ })).toBeVisible();
  await page.getByRole('button', { name: 'My workouts', exact: true }).click();
  await page.getByRole('button', { name: 'Build my guided routine' }).click();
  await expect(page.getByRole('heading', { name: 'My routine · Balanced start' })).toBeVisible();
  await page.getByRole('button', { name: 'Start workout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My routine · Balanced start' })).toBeVisible();
  await page.getByRole('button', { name: 'Completed', exact: true }).first().click();
  await expect(
    page.getByRole('button', { name: 'Completed', exact: true }).first(),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Completed', exact: true }).first(),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workout summary', exact: true })).toBeVisible();
  await page.request.post('/api/account/delete', { data: { password: 'BrowserTestPassword!' } });
});
test('coach reviews a consented client and assigns a program through the visual builder', async ({
  page,
}) => {
  await page.goto('/coach-login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('coach@nutri.local');
  await page.getByLabel(/^Password/).fill('NutriCoach2026!');
  await page.getByRole('button', { name: 'Coach sign-in', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await page.getByRole('button', { name: 'Client profile' }).click();
  await expect(page.locator('.client-profile h1')).toHaveText('Alex Morgan');
  await expect(page.locator('.client-tabs')).toBeVisible();
  await page.locator('.client-profile-back').click();
  await page.getByRole('button', { name: 'Workout plans', exact: true }).click();
  await page.getByRole('button', { name: 'Create workout', exact: true }).first().click();
  const title = `Coach browser routine ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Workout name', exact: true }).fill(title);
  await page
    .getByRole('combobox', { name: 'Assign to client' })
    .selectOption({ label: 'Alex Morgan' });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('.wb-empty').getByRole('button', { name: 'Add exercises' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Legs', exact: true }).click();
  await page.locator('.wb-result-pick').first().click();
  await page.getByRole('button', { name: 'Add to workout (1)' }).click();
  await page.getByRole('button', { name: 'Decrease Sets' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Sets', exact: true })).toHaveValue('2');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/programs/save') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save workout', exact: true }).click();
  const record = await (await saved).json();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.request.post('/api/programs/delete', { data: { id: record.id } });
  await page.goto('/app/billing');
  await expect(
    page.getByText('Billing provider is not connected. No payment will be collected.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Not connected' }).first()).toBeDisabled();
});
