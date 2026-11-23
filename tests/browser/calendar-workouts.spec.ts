import { test, expect } from '@playwright/test';

for (const language of ['he', 'en'] as const) {
  test(`calendar displays workout status and monthly navigation in ${language}`, async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-11-22T12:00:00Z') });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Explore the demo' }).click();
    await expect(page).toHaveURL(/\/app\/?$/);
    await page.request.post('/api/preferences', { data: { language, theme: 'light' } });
    await page.route('**/api/state*', async (route) => {
      const response = await route.fetch();
      const state = await response.json();
      state.profile.timezone = 'Asia/Jerusalem';
      state.programs = [
        {
          id: 'calendar-plan',
          name: 'Calendar strength',
          ownerId: state.user.id,
          assignedClientId: null,
          template: false,
          days: '0,1,2,3,4,5,6',
          weeks: 0,
          createdAt: '2026-11-01T10:00:00Z',
          exercises: [],
        },
      ];
      state.calendarWorkouts = [
        {
          id: 'finished',
          name: 'Calendar strength',
          programId: 'calendar-plan',
          startedAt: '2026-11-20T10:00:00Z',
          status: 'FINISHED',
          sets: [{ completed: true }],
        },
      ];
      await route.fulfill({ response, json: state });
    });
    await page.goto('/app/calendar');
    const grid = page.locator('.month-grid');
    await expect(grid.locator('.workoutDone')).toHaveCount(1);
    await expect(grid.locator('.workoutMissed')).toHaveCount(20);
    await expect(grid.locator('.workoutPending')).toHaveCount(9);
    await expect(grid.locator('.workoutDone')).toContainText(
      language === 'he' ? 'בוצע' : 'Completed',
    );
    await expect(grid.locator('.workoutMissed').first()).toContainText(
      language === 'he' ? 'פוספס' : 'Missed',
    );
    await expect(grid.locator('.workoutPending').first()).toContainText(
      language === 'he' ? 'טרם בוצע' : 'Not yet completed',
    );
    await grid.locator('.workoutDone').click();
    await expect(page.locator('#plan-calendar-plan-2026-11-20')).toBeInViewport();
    await page
      .getByRole('button', {
        name: language === 'he' ? 'החודש הקודם' : 'Previous month',
        exact: true,
      })
      .click();
    await expect(grid.locator('.workout-status')).toHaveCount(0);
    await page
      .getByRole('button', { name: language === 'he' ? 'היום' : 'Today', exact: true })
      .click();
    await expect(grid.locator('.workout-status')).toHaveCount(30);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(grid.locator('.workoutDone')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  });
}
