import { expect, test, type Page } from '@playwright/test';

const copy = {
  en: {
    search: 'Search exercises…',
    name: 'Workout name',
    nameError: 'Give the workout a name.',
    push: 'Push day',
    continue: 'Continue',
    addExercises: 'Add exercises',
    addSelected: 'Add to workout',
    added: 'Already in this workout',
    increaseSets: 'Increase Sets',
    sets: 'Sets',
    useRange: 'Use a range',
    repsFrom: 'Reps from',
    repsTo: 'Reps to',
    link: 'Link as superset',
    superset: 'Superset A',
    addNote: 'Add note',
    note: 'Notes for this exercise',
    replace: 'Replace',
    replaceTitle: 'Replace exercise',
    duplicate: 'Duplicate',
    restored: 'We restored your unsaved draft.',
    saveWorkout: 'Save workout',
    saveChanges: 'Save changes',
    move: 'Move to',
    reorder: 'Drag to reorder',
    chest: 'Chest',
  },
  he: {
    search: 'חיפוש תרגילים…',
    name: 'שם האימון',
    nameError: 'תנו שם לאימון.',
    push: 'יום דחיפה',
    continue: 'המשך',
    addExercises: 'הוספת תרגילים',
    addSelected: 'הוספה לאימון',
    added: 'כבר באימון',
    increaseSets: 'הגדלת סטים',
    sets: 'סטים',
    useRange: 'טווח חזרות',
    repsFrom: 'חזרות מ־',
    repsTo: 'חזרות עד',
    link: 'חיבור לסופרסט',
    superset: 'סופרסט A',
    addNote: 'הוספת הערה',
    note: 'הערות לתרגיל',
    replace: 'החלפה',
    replaceTitle: 'החלפת תרגיל',
    duplicate: 'שכפול',
    restored: 'שחזרנו את הטיוטה שלא נשמרה.',
    saveWorkout: 'שמירת האימון',
    saveChanges: 'שמירת שינויים',
    move: 'העברה ליום',
    reorder: 'גררו לשינוי הסדר',
    chest: 'חזה',
  },
};

async function cardNames(page: Page) {
  return page.locator('.wb-card .wb-card-title strong').allInnerTexts();
}

for (const language of ['en', 'he'] as const) {
  test(`step-by-step workout creation, editing and weekly scheduling in ${language}`, async ({
    page,
  }) => {
    const c = copy[language];
    const password = 'Builder-Layout-2026!';
    expect(
      (
        await page.request.post('/api/auth/register', {
          data: {
            name: 'Builder layout',
            email: `builder-${language}-${Date.now()}@example.test`,
            acceptTerms: true,
            password,
            role: 'INDEPENDENT',
            language,
          },
        })
      ).ok(),
    ).toBeTruthy();
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/app/builder');
      await expect(page.locator('html')).toHaveAttribute('dir', language === 'he' ? 'rtl' : 'ltr');
      const bar = page.locator('.wb-actionbar');
      await expect(bar).toBeVisible();
      expect(
        await bar.evaluate((node) => node.getBoundingClientRect().bottom <= innerHeight + 1),
      ).toBe(true);

      // Step 1: validation, a name suggestion and today's day picked by default.
      await bar.getByRole('button', { name: c.continue, exact: true }).click();
      await expect(page.getByText(c.nameError)).toBeVisible();
      await page.getByRole('button', { name: c.push, exact: true }).click();
      await expect(page.getByLabel(c.name, { exact: true })).toHaveValue(c.push);
      const days = page.locator('.wb-days .wb-day');
      await expect(days).toHaveCount(7);
      await expect(page.locator('.wb-day.today')).toHaveAttribute('aria-pressed', 'true');
      const todayIndex = await days.evaluateAll((nodes) =>
        nodes.findIndex((node) => node.classList.contains('today')),
      );
      const otherIndex = (todayIndex + 2) % 7;
      await days.nth(otherIndex).click();
      await expect(days.nth(otherIndex)).toHaveAttribute('aria-pressed', 'true');
      await bar.getByRole('button', { name: c.continue, exact: true }).click();

      // Step 2: multi-select from the picker, with filters.
      await page
        .locator('.wb-empty')
        .getByRole('button', { name: c.addExercises, exact: true })
        .click();
      const picker = page.getByRole('dialog');
      await expect(picker).toBeVisible();
      await picker.getByRole('searchbox', { name: c.search }).fill('press');
      await picker.getByRole('button', { name: c.chest, exact: true }).click();
      const results = picker.locator('.wb-result-pick');
      await expect(results.first()).toBeVisible();
      const firstName = await results.nth(0).locator('strong').innerText();
      const secondName = await results.nth(1).locator('strong').innerText();
      await results.nth(0).click();
      await results.nth(1).click();
      await picker.getByRole('button', { name: `${c.addSelected} (2)` }).click();
      await expect(picker).toHaveCount(0);
      await expect(page.locator('.wb-card')).toHaveCount(2);
      expect(await cardNames(page)).toEqual([firstName, secondName]);

      // Configure the first card: sets, superset; and a note on the second. Reps are one target.
      const first = page.locator('.wb-card').first();
      await first.getByRole('button', { name: c.increaseSets }).click();
      await expect(first.getByRole('spinbutton', { name: c.sets, exact: true })).toHaveValue('4');
      await expect(first.getByRole('button', { name: c.useRange })).toHaveCount(0);
      await expect(first.getByRole('spinbutton', { name: c.repsTo })).toHaveCount(0);
      await page.locator('.wb-link').first().click();
      await expect(page.locator('.wb-superset-badge')).toHaveText([c.superset, c.superset]);
      const second = page.locator('.wb-card').nth(1);
      await second.getByRole('button', { name: c.addNote }).click();
      await second.getByLabel(c.note).fill('Pause at the bottom');

      // Reorder with the keyboard and with a pointer drag on the handle.
      await page.getByRole('button', { name: `${c.reorder}: ${firstName}` }).press('ArrowDown');
      await expect.poll(() => cardNames(page)).toEqual([secondName, firstName]);
      const handle = page.getByRole('button', { name: `${c.reorder}: ${firstName}` });
      const target = await page.locator('.wb-card').first().boundingBox();
      const box = await handle.boundingBox();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width / 2, target!.y + 10, { steps: 12 });
      await page.mouse.up();
      await expect.poll(() => cardNames(page)).toEqual([firstName, secondName]);

      // Exercises already in the workout are marked in the picker; replace and duplicate keep settings.
      await page.locator('.wb-add-more').click();
      await picker.getByRole('searchbox', { name: c.search }).fill(firstName);
      const addedRow = picker.locator('.wb-result-pick').filter({ hasText: firstName }).first();
      await expect(addedRow).toBeEnabled(); // an exercise may be added again
      await expect(addedRow).toContainText(c.added);
      await picker.press('Escape');
      await expect(picker).toHaveCount(0);
      await page.locator('.wb-card').nth(1).getByRole('button', { name: c.replace }).click();
      await expect(page.getByRole('dialog', { name: c.replaceTitle })).toBeVisible();
      await picker.getByRole('searchbox', { name: c.search }).fill('row');
      const replacement = picker.locator('.wb-result-pick:not(:disabled)').first();
      const replacementName = await replacement.locator('strong').innerText();
      await replacement.click();
      await expect.poll(() => cardNames(page)).toEqual([firstName, replacementName]);
      await expect(page.locator('.wb-card').nth(1).getByLabel(c.note)).toHaveValue(
        'Pause at the bottom',
      );
      // Duplicate repeats the same exercise right below, with every setting.
      await page.locator('.wb-card').first().getByRole('button', { name: c.duplicate }).click();
      await expect.poll(() => cardNames(page)).toEqual([firstName, firstName, replacementName]);
      await expect(
        page.locator('.wb-card').nth(1).getByRole('spinbutton', { name: c.repsTo }),
      ).toHaveValue('12');
      // The copy joins the superset it was inserted into.
      await expect(page.locator('.wb-superset-badge')).toHaveCount(2);

      // Autosave: a reload restores the unfinished draft.
      await page.waitForTimeout(700);
      await page.reload();
      await expect(page.getByText(c.restored)).toBeVisible();
      await expect.poll(() => cardNames(page)).toEqual([firstName, firstName, replacementName]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
      await page.screenshot({ path: `test-results/builder-cards-${language}.png`, fullPage: true });

      // Step 3: review summary, then save.
      await bar.getByRole('button', { name: c.continue, exact: true }).click();
      const review = page.locator('.wb-main .wb-preview');
      await expect(review.locator('h3')).toHaveText(c.push);
      await expect(review.locator('.wb-stats dd').nth(0)).toHaveText('3');
      await expect(review.locator('.wb-stats dd').nth(1)).toHaveText('11');
      await expect(review.locator('.wb-order li')).toHaveCount(3);
      await expect(review.locator('.wb-muscles .wb-chip').first()).toBeVisible();
      await page.screenshot({
        path: `test-results/builder-review-${language}.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.locator('.wb-step').nth(1).click();
      await expect(page.locator('.wb-aside .wb-order li')).toHaveCount(3);
      await page.screenshot({
        path: `test-results/builder-desktop-${language}.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.wb-step').nth(2).click();
      const saving = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/programs/save') && response.request().method() === 'POST',
      );
      await bar.getByRole('button', { name: c.saveWorkout, exact: true }).click();
      const saved = await saving;
      expect(saved.ok()).toBeTruthy();
      const body = saved.request().postDataJSON();
      expect(body.exercises).toHaveLength(3);
      expect(body.exercises[0]).toMatchObject({ sets: 4, reps: 10, repsMax: 0 });
      expect(body.exercises[0].group).toBeTruthy();
      expect(body.exercises[1].group).toBe(body.exercises[0].group);
      expect(body.exercises[2].notes).toBe('Pause at the bottom');
      const program = await saved.json();
      await expect(page).toHaveURL(/\/app\/workouts/);
      await expect(
        page.locator('.program-card').getByRole('heading', { name: c.push, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          (key) => localStorage.getItem(key),
          `fitura-workout-draft:${(await (await page.request.get('/api/state')).json()).user.id}:new`,
        ),
      ).toBeNull();

      // Duplicating from the workout card copies every setting.
      const copying = page.waitForResponse((r) => r.url().endsWith('/api/programs/duplicate'));
      await page
        .locator('.program-card')
        .filter({ hasText: c.push })
        .first()
        .getByRole('button', { name: c.duplicate, exact: true })
        .click();
      const duplicated = await copying;
      expect(duplicated.ok()).toBeTruthy();
      const state = await (await page.request.get('/api/state')).json();
      const { id: cloneId } = await duplicated.json();
      const clone = state.programs.find((p: { id: string }) => p.id === cloneId);
      expect(clone.exercises.map((row: { repsMax: number }) => row.repsMax)).toEqual([0, 0, 0]);

      // Editing loads every saved value and keeps the same workout.
      await page.goto(`/app/builder?id=${program.id}`);
      await expect(page.getByLabel(c.name, { exact: true })).toHaveValue(c.push);
      await page.getByLabel(c.name, { exact: true }).fill('Push day v2');
      await page.locator('.wb-step').nth(1).click();
      await expect(
        page.locator('.wb-card').first().getByRole('spinbutton', { name: c.repsTo }),
      ).toHaveValue('12');
      const editing = page.waitForResponse((r) => r.url().endsWith('/api/programs/save'));
      await page.locator('.wb-step').nth(2).click();
      await bar.getByRole('button', { name: c.saveChanges, exact: true }).click();
      const edited = await editing;
      expect(edited.ok()).toBeTruthy();
      expect(edited.request().postDataJSON().id).toBe(program.id);
      await expect(page.getByRole('heading', { name: 'Push day v2', exact: true })).toBeVisible();
    } finally {
      await page.request.post('/api/account/delete', { data: { password } });
    }
  });
}
