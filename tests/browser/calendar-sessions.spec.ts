import { expect, test } from '@playwright/test';

for (const language of ['he', 'en'] as const) {
  test(`coach sessions sync to the client calendar in ${language}`, async ({ browser }) => {
    test.setTimeout(90000);
    const coach = await browser.newContext();
    const client = await browser.newContext();
    const outsider = await browser.newContext();
    const password = 'Calendar-Sessions-Test-2026!';
    const suffix = `${language}-${Date.now()}`;
    const email = `calendar-client-${suffix}@example.test`;
    const post = async (context: typeof coach, path: string, data: unknown) => {
      const response = await context.request.post(`/api/${path}`, { data });
      expect(response.ok(), await response.text()).toBeTruthy();
      return response.json();
    };
    try {
      await post(coach, 'auth/coach/register', {
        name: 'Calendar Coach',
        email: `calendar-coach-${suffix}@example.test`,
        phone: '+972501234567',
        acceptTerms: true,
        password,
        language,
      });
      const { user: clientUser } = await post(client, 'auth/user/register', {
        name: 'Calendar Client',
        email,
        acceptTerms: true,
        password,
        language,
      });
      const { user: outsiderUser } = await post(outsider, 'auth/user/register', {
        name: 'Unrelated Client',
        email: `calendar-outsider-${suffix}@example.test`,
        acceptTerms: true,
        password,
        language,
      });
      await post(coach, 'clients/invite', { email });
      const { relationships } = await (await client.request.get('/api/state')).json();
      await post(client, 'clients/respond', { id: relationships[0].id, accept: true });
      const coachPage = await coach.newPage();
      const clientPage = await client.newPage();
      await coachPage.goto('/app/calendar');
      await clientPage.goto('/app/calendar');
      await expect(clientPage.locator('.month-grid')).toBeVisible();
      const startsAt = new Date(Date.now() + 86400000);
      startsAt.setHours(10, 0, 0, 0);
      if (startsAt.getMonth() !== new Date().getMonth()) {
        for (const page of [coachPage, clientPage]) {
          await page
            .getByRole('button', {
              name: language === 'he' ? 'החודש הבא' : 'Next month',
              exact: true,
            })
            .click();
        }
      }
      const localDateTime = (date: Date) =>
        new Date(+date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      for (const [index, kind] of ['MEETING', 'PERSONAL_TRAINING'].entries()) {
        const title = `Shared ${kind} ${suffix}`;
        const date = new Date(+startsAt + index * 3600000);
        await coachPage
          .getByRole('button', {
            name: language === 'he' ? 'קביעת פגישה' : 'Book a session',
            exact: true,
          })
          .click();
        const form = coachPage.locator('form').filter({ has: coachPage.locator('[name=guestId]') });
        await form.locator('[name=kind]').selectOption(kind);
        await form.locator('[name=title]').fill(title);
        await form.locator('[name=guestId]').selectOption(clientUser.id);
        await form.locator('[name=startsAt]').fill(localDateTime(date));
        await form.locator('[name=duration]').fill('60');
        await form.locator('[name=notes]').fill('Bring a water bottle');
        await form.locator('button[type=submit]').click();
        await expect(form).toHaveCount(0);
        const clientRow = clientPage.locator('.appointment-row').filter({ hasText: title });
        await expect(clientRow).toBeVisible({ timeout: 15000 });
        await expect(clientRow).toContainText('Calendar Coach');
        await expect(clientRow).toContainText('Bring a water bottle');
        const label =
          kind === 'MEETING'
            ? language === 'he'
              ? 'פגישה'
              : 'Meeting'
            : language === 'he'
              ? 'אימון אישי'
              : 'Personal training';
        await expect(clientRow).toContainText(label);
        await expect(
          clientPage.locator('.month-grid').getByRole('button').filter({ hasText: title }),
        ).toContainText(label);
        const coachRow = coachPage.locator('.appointment-row').filter({ hasText: title });
        await expect(coachRow).toContainText('Calendar Client');
        const state = await (await client.request.get('/api/state')).json();
        const appointment = state.appointments.find(
          (item: { title: string }) => item.title === title,
        );
        expect(appointment.kind).toBe(kind);
        expect(appointment.ownerId).toBe(relationships[0].coachId);
        expect(appointment.guestId).toBe(clientUser.id);
        expect((await (await outsider.request.get('/api/state')).json()).appointments).toEqual([]);
        expect(
          (
            await outsider.request.post('/api/appointments/update', {
              data: { id: appointment.id, status: 'CANCELLED' },
            })
          ).status(),
        ).toBe(403);
        expect(
          (
            await coach.request.post('/api/appointments', {
              data: {
                title: 'Overlap',
                guestId: clientUser.id,
                startsAt: date.toISOString(),
                duration: 30,
              },
            })
          ).status(),
        ).toBe(409);
        expect(
          (
            await coach.request.post('/api/appointments', {
              data: {
                title: 'Unrelated',
                guestId: outsiderUser.id,
                startsAt: date.toISOString(),
                duration: 30,
              },
            })
          ).status(),
        ).toBe(403);
        if (kind === 'MEETING') {
          const updated = coachPage.waitForResponse(
            (response) =>
              response.url().endsWith('/api/appointments/update') &&
              response.request().method() === 'POST',
          );
          await coachRow
            .getByRole('button', { name: language === 'he' ? 'ביטול פגישה' : 'Cancel booking' })
            .click();
          expect((await updated).ok()).toBeTruthy();
          await expect(clientRow.locator('.badge')).toHaveText(
            language === 'he' ? 'בוטלה' : 'Cancelled',
            { timeout: 15000 },
          );
          await expect(
            clientPage.locator('.month-grid').getByRole('button').filter({ hasText: title }),
          ).toHaveCount(0);
        } else {
          expect(
            (
              await client.request.post('/api/appointments/update', {
                data: { id: appointment.id, status: 'ATTENDED' },
              })
            ).status(),
          ).toBe(403);
          const updated = coachPage.waitForResponse(
            (response) =>
              response.url().endsWith('/api/appointments/update') &&
              response.request().method() === 'POST',
          );
          await coachRow
            .getByRole('button', { name: language === 'he' ? 'סימון נוכחות' : 'Mark attended' })
            .click();
          expect((await updated).ok()).toBeTruthy();
          await expect(clientRow.locator('.badge')).toHaveText(
            language === 'he' ? 'התקיימה' : 'Attended',
            { timeout: 15000 },
          );
        }
        await clientPage.reload();
        await expect(clientRow).toContainText(title);
      }
      await post(coach, 'appointments', {
        title: 'Private calendar event',
        guestId: null,
        startsAt: new Date(+startsAt + 7200000).toISOString(),
        duration: 30,
      });
      const clientState = await (await client.request.get('/api/state')).json();
      expect(clientState.appointments).toHaveLength(2);
      expect(
        clientState.notifications.some(
          (item: { key: string }) => item.key === 'appointmentUpdated',
        ),
      ).toBeTruthy();
      await clientPage.setViewportSize({ width: 390, height: 844 });
      expect(
        await clientPage.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      ).toBe(false);
    } finally {
      for (const context of [coach, client, outsider]) {
        await context.request.post('/api/account/delete', { data: { password } });
        await context.close();
      }
    }
  });
}
