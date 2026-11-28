// Regenerates the README screenshots in docs/images/ from a running dev server.
// Usage: npm run dev   (in another terminal), then: npm run docs:screenshots [home|personal|coach]
// Uses the seeded development accounts, so never point BASE_URL at production.
import { chromium } from '@playwright/test';
const out = 'docs/images/';
const base = process.env.BASE_URL || 'http://localhost:3000';
const only = process.argv[2];
const browser = await chromium.launch(
  process.platform === 'win32'
    ? { executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' }
    : {},
);
const cookie = {
  name: 'fitura-cookies',
  value: 'necessary',
  domain: new URL(base).hostname,
  path: '/',
};

async function settle(p) {
  await p.waitForLoadState('networkidle').catch(() => {});
  await p
    .locator('text=/Getting your space ready/')
    .first()
    .waitFor({ state: 'hidden', timeout: 30000 })
    .catch(() => {});
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  await p.waitForTimeout(2500);
}
async function ctx(viewport) {
  const c = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await c.addCookies([cookie]);
  return c;
}
async function acceptConsent(p) {
  const box = p.getByRole('dialog').getByRole('checkbox');
  if (await box.count()) {
    await box.check();
    await p.getByRole('button', { name: 'Accept and continue' }).click();
    await p.waitForTimeout(1000);
  }
}

if (!only || only === 'home') {
  const c = await ctx({ width: 1440, height: 900 });
  const p = await c.newPage();
  await p.goto(base + '/');
  await settle(p);
  await p.screenshot({ path: out + 'home.png' });
  await c.close();
}

if (!only || only === 'personal') {
  const c = await ctx({ width: 1440, height: 900 });
  const p = await c.newPage();
  await p.goto(base + '/login');
  await p.getByRole('button', { name: 'Explore the demo' }).click();
  await p.waitForURL(/\/app\/?$/);
  await p.request.post(base + '/api/preferences', { data: { language: 'en', theme: 'light' } });
  for (const [slug, file] of [
    ['', 'dashboard'],
    ['workouts', 'workouts'],
    ['builder', 'workout-builder'],
    ['library', 'exercise-library'],
    ['nutrition', 'nutrition'],
    ['mealPlans', 'meal-plans'],
    ['progress', 'progress'],
  ]) {
    await p.goto(base + '/app/' + slug);
    await settle(p);
    await acceptConsent(p);
    const browse = p.getByRole('button', { name: 'Browse workouts' });
    if (await browse.count()) {
      await browse.click();
      await p.waitForTimeout(800);
    }
    await p.screenshot({ path: out + file + '.png' });
  }
  await p.request.post(base + '/api/preferences', { data: { language: 'he', theme: 'dark' } });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(base + '/app');
  await settle(p);
  await p.screenshot({ path: out + 'mobile-hebrew-dark.png' });
  await p.request.post(base + '/api/preferences', { data: { language: 'en', theme: 'light' } });
  await c.close();
}

if (!only || only === 'coach') {
  const c = await ctx({ width: 1440, height: 900 });
  const p = await c.newPage();
  await p.goto(base + '/login');
  await p.getByRole('textbox', { name: 'Email', exact: true }).fill('coach@nutri.local');
  await p.getByLabel(/^Password/).fill('NutriCoach2026!');
  await p.getByRole('button', { name: /^Sign in$/ }).click();
  await p.waitForURL(/\/app/);
  await settle(p);
  await acceptConsent(p);
  await p.request.post(base + '/api/preferences', { data: { language: 'en', theme: 'light' } });
  for (const [slug, file] of [
    ['', 'coach-dashboard'],
    ['clients', 'coach-clients'],
  ]) {
    await p.goto(base + '/app/' + slug);
    await settle(p);
    await p.screenshot({ path: out + file + '.png' });
  }
  await c.close();
}
await browser.close();
console.log('done');
