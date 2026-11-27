import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  draftFromProgram,
  estimateMinutes,
  linkedWithNext,
  moveDay,
  moveExercise,
  newPlanExercise,
  normalizeGroups,
  planBlocks,
  repsLabel,
  restLabel,
  supersetLabels,
  targetMuscles,
  toggleDay,
  toggleSuperset,
  validatePlan,
} from '../src/lib/workout-plan';
import type { ProgramDraft } from '../src/lib/types';

const row = (
  exerciseId: string,
  group = '',
  extra: Partial<ReturnType<typeof newPlanExercise>> = {},
) => ({
  ...newPlanExercise(exerciseId),
  group,
  ...extra,
});

test('new exercises get sensible editable defaults', () => {
  assert.deepEqual(newPlanExercise('squat'), {
    exerciseId: 'squat',
    sets: 3,
    reps: 10,
    repsMax: 0,
    rest: 90,
    weight: 0,
    notes: '',
    group: '',
  });
  // A duplicate copies the settings, never the superset membership.
  assert.equal(newPlanExercise('lunge', { sets: 5, group: 'S1' } as never).group, '');
  assert.equal(newPlanExercise('lunge', { sets: 5 }).sets, 5);
});

test('supersets are contiguous runs sharing a group label', () => {
  const rows = [row('a', 'S1'), row('b', 'S1'), row('c'), row('d', 'x'), row('e', 'x')];
  assert.deepEqual(planBlocks(rows), [
    { start: 0, end: 1, superset: true },
    { start: 2, end: 2, superset: false },
    { start: 3, end: 4, superset: true },
  ]);
  assert.deepEqual(supersetLabels(rows), ['A', 'A', '', 'B', 'B']);
  assert.ok(linkedWithNext(rows, 0));
  assert.ok(!linkedWithNext(rows, 1));
});

test('normalizing clears lone labels and splits reused labels', () => {
  const rows = normalizeGroups([
    row('a', 'S1'),
    row('b'),
    row('c', 'S1'),
    row('d', 'S1'),
    row('e', 'z'),
  ]);
  assert.deepEqual(
    rows.map((r) => r.group),
    ['', '', 'S1', 'S1', ''],
  );
  const reused = normalizeGroups([
    row('a', 'S1'),
    row('b', 'S1'),
    row('c'),
    row('d', 'S1'),
    row('e', 'S1'),
  ]);
  assert.equal(reused[0].group, 'S1');
  assert.notEqual(reused[3].group, 'S1');
  assert.equal(reused[3].group, reused[4].group);
});

test('linking and unlinking merges and splits supersets', () => {
  let rows = [row('a'), row('b'), row('c'), row('d')];
  rows = toggleSuperset(rows, 0);
  assert.deepEqual(supersetLabels(rows), ['A', 'A', '', '']);
  rows = toggleSuperset(rows, 2);
  assert.deepEqual(supersetLabels(rows), ['A', 'A', 'B', 'B']);
  // Linking b-c merges both supersets into one giant set.
  rows = toggleSuperset(rows, 1);
  assert.deepEqual(supersetLabels(rows), ['A', 'A', 'A', 'A']);
  rows = toggleSuperset(rows, 1);
  assert.deepEqual(supersetLabels(rows), ['A', 'A', 'B', 'B']);
  rows = toggleSuperset(rows, 0);
  assert.deepEqual(supersetLabels(rows), ['', '', 'A', 'A']);
  assert.equal(toggleSuperset(rows, 3), rows);
});

test('reordering keeps supersets contiguous', () => {
  const rows = [row('a', 'S1'), row('b', 'S1'), row('c'), row('d')];
  // Moving a member out leaves its partner alone.
  const out = moveExercise(rows, 0, 3);
  assert.deepEqual(
    out.map((r) => r.exerciseId),
    ['b', 'c', 'd', 'a'],
  );
  assert.deepEqual(supersetLabels(out), ['', '', '', '']);
  // Dropping between two members joins the superset.
  const into = moveExercise([row('a', 'S1'), row('b', 'S1'), row('c')], 2, 1);
  assert.deepEqual(
    into.map((r) => r.exerciseId),
    ['a', 'c', 'b'],
  );
  assert.deepEqual(supersetLabels(into), ['A', 'A', 'A']);
  assert.equal(moveExercise(rows, 1, 1), rows);
});

test('duration estimate accounts for sets, reps, rest and supersets', () => {
  assert.equal(estimateMinutes([]), 0);
  // 3 x 10 reps: 3 x 40 s work + 2 x 90 s rest + 60 s transition = 360 s.
  assert.equal(estimateMinutes([row('a')]), 6);
  // A superset rests once per round: 6 x 40 + 2 x 90 + 60 = 480 s.
  assert.equal(estimateMinutes([row('a', 'S1'), row('b', 'S1')]), 8);
  // The same two exercises as straight sets take longer.
  assert.equal(estimateMinutes([row('a'), row('b')]), 12);
  // A range uses its midpoint: 8-12 averages 10 reps.
  assert.equal(
    estimateMinutes([row('a', '', { repsMax: 12, reps: 8 })]),
    estimateMinutes([row('a')]),
  );
  assert.equal(estimateMinutes([row('a', '', { sets: 1, reps: 1, rest: 0 })]), 1);
});

test('labels, muscles and weekday helpers', () => {
  assert.equal(repsLabel({ reps: 8, repsMax: 12 }), '8–12');
  assert.equal(repsLabel({ reps: 8, repsMax: 0 }), '8');
  assert.equal(restLabel(45), '45');
  assert.equal(restLabel(90), '1:30');
  assert.equal(restLabel(120), '2:00');
  const muscle: Record<string, string> = { a: 'chest', b: 'triceps', c: 'chest' };
  assert.deepEqual(
    targetMuscles([row('b', '', { sets: 5 }), row('a'), row('c'), row('zzz')], (id) => muscle[id]),
    ['chest', 'triceps'],
  );
  assert.equal(toggleDay('1,3', 5), '1,3,5');
  assert.equal(toggleDay('1,3,5', 3), '1,5');
  assert.equal(toggleDay('', 0), '0');
  assert.equal(moveDay('1,3,5', 3, 4), '1,4,5');
  assert.equal(moveDay('1,3', 3, 1), '1');
});

test('validation explains what is missing', () => {
  const draft: ProgramDraft = {
    name: ' ',
    description: '',
    weeks: 0,
    days: '',
    template: false,
    assignedClientId: null,
    exercises: [],
  };
  assert.deepEqual(
    validatePlan(draft).map((issue) => issue.issue),
    ['workoutNameRequired', 'workoutDayRequired', 'addExercise'],
  );
  // Templates do not need a day.
  assert.deepEqual(
    validatePlan({ ...draft, name: 'Push', template: true, exercises: [row('a')] }),
    [],
  );
  assert.deepEqual(
    validatePlan({
      ...draft,
      name: 'Push',
      days: '1',
      exercises: [row('a', '', { reps: 12, repsMax: 8 }), row('b', '', { sets: 0 })],
    }),
    [
      { field: '0', issue: 'repRangeInvalid' },
      { field: '1', issue: 'planValueInvalid' },
    ],
  );
});

test('saved programs without the newer fields load as drafts', () => {
  const draft = draftFromProgram({
    id: 'p1',
    name: 'Legacy',
    description: '',
    days: '1,3',
    template: false,
    assignedClientId: null,
    exercises: [{ exerciseId: 'a', sets: 3, reps: 10, rest: 60, weight: 20, group: '' }],
  });
  assert.equal(draft.id, 'p1');
  assert.deepEqual(draft.exercises[0], {
    exerciseId: 'a',
    sets: 3,
    reps: 10,
    repsMax: 0,
    rest: 60,
    weight: 20,
    notes: '',
    group: '',
  });
});
