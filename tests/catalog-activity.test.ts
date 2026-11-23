import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogQuery } from '../src/lib/exercise-catalog';
import { healthSyncInput, cardioInput } from '../src/lib/activity';

test('catalog accepts only the free provider and validates pagination', () => {
  assert.equal(catalogQuery.parse({}).provider, 'free');
  assert(!catalogQuery.safeParse({ provider: 'workoutx' }).success);
  assert(!catalogQuery.safeParse({ offset: '-1' }).success);
});

test('health snapshots accept partial permissions but reject impossible totals and dates', () => {
  const snapshot = { source: 'apple-health', date: '2026-11-21', steps: 4300, activities: [] };
  assert(healthSyncInput.safeParse(snapshot).success);
  assert(healthSyncInput.safeParse({ ...snapshot, steps: null }).success);
  assert(!healthSyncInput.safeParse({ ...snapshot, steps: -1 }).success);
  assert(!healthSyncInput.safeParse({ ...snapshot, steps: 2.5 }).success);
  assert(!healthSyncInput.safeParse({ ...snapshot, date: '2026-02-30' }).success);
  assert(!healthSyncInput.safeParse({ ...snapshot, source: 'untrusted' }).success);
  assert(
    !cardioInput.safeParse({ kind: 'running', minutes: 0, date: snapshot.date, externalId: 'one' })
      .success,
  );
});
