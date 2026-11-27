import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLiveSync, type LiveSet, type PlanRow } from '../src/lib/live-sync';

const row = (exerciseId: string, position: number, values: Partial<PlanRow> = {}): PlanRow => ({
  exerciseId,
  position,
  sets: 3,
  reps: 10,
  weight: 20,
  rest: 60,
  ...values,
});
const setsOf = (
  exerciseId: string,
  position: number,
  count: number,
  completed = 0,
  values: Partial<LiveSet> = {},
): LiveSet[] =>
  Array.from({ length: count }, (_, setIndex) => ({
    id: `${exerciseId}-${position}-${setIndex}`,
    exerciseId,
    position,
    setIndex,
    reps: 10,
    weight: 20,
    restSeconds: 60,
    completed: setIndex < completed,
    ...values,
  }));

test('an unchanged plan changes nothing', () => {
  const previous = [row('squat', 0), row('bench', 1)];
  const plan = planLiveSync(
    [...setsOf('squat', 0, 3, 1), ...setsOf('bench', 1, 3)],
    previous,
    previous,
  );
  assert.deepEqual(plan, { update: [], create: [], remove: [] });
});

test('adding sets and a new exercise creates the missing sets', () => {
  const previous = [row('squat', 0)];
  const plan = planLiveSync(setsOf('squat', 0, 3, 2, { weight: 25 }), previous, [
    row('squat', 0, { sets: 4 }),
    row('row', 1, { sets: 2 }),
  ]);
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(
    plan.create.map((set) => [set.exerciseId, set.position, set.setIndex, set.weight]),
    [
      ['squat', 0, 3, 25],
      ['row', 1, 0, 20],
      ['row', 1, 1, 20],
    ],
  );
});

test('fewer sets removes only unfinished sets', () => {
  const previous = [row('squat', 0, { sets: 4 })];
  const plan = planLiveSync(setsOf('squat', 0, 4, 3), previous, [row('squat', 0, { sets: 2 })]);
  assert.deepEqual(plan.remove, ['squat-0-3']);
});

test('reordering moves sets with their exercise and keeps logged sets of removed ones', () => {
  const previous = [row('squat', 0), row('bench', 1), row('curl', 2)];
  const plan = planLiveSync(
    [...setsOf('squat', 0, 3, 1), ...setsOf('bench', 1, 3), ...setsOf('curl', 2, 3, 1)],
    previous,
    [row('bench', 0), row('squat', 1)],
  );
  const positions = Object.fromEntries(plan.update.map((u) => [u.id, u.data.position]));
  assert.equal(positions['bench-1-0'], 0);
  assert.equal(positions['squat-0-0'], 1);
  assert.equal(positions['curl-2-0'], undefined); // already right after the plan
  assert.deepEqual(plan.remove.sort(), ['curl-2-1', 'curl-2-2']);
});

test('a repeated exercise keeps a block per entry', () => {
  const previous = [row('bench', 0)];
  const plan = planLiveSync(setsOf('bench', 0, 3, 3), previous, [
    row('bench', 0),
    row('bench', 1, { sets: 2 }),
  ]);
  assert.deepEqual(
    plan.create.map((set) => [set.position, set.setIndex]),
    [
      [1, 0],
      [1, 1],
    ],
  );
});

test('a changed plan weight overrides unfinished sets, an unchanged one keeps carried values', () => {
  const previous = [row('squat', 0), row('bench', 1)];
  const sets = [
    ...setsOf('squat', 0, 3, 1, { weight: 30 }),
    ...setsOf('bench', 1, 3, 0, { weight: 40 }),
  ];
  const plan = planLiveSync(sets, previous, [row('squat', 0, { weight: 50 }), row('bench', 1)]);
  assert.deepEqual(
    plan.update.map((u) => [u.id, u.data.weight]),
    [
      ['squat-0-1', 50],
      ['squat-0-2', 50],
    ],
  );
});
