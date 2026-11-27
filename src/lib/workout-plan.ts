import type { ProgramDraft } from './types';

/** One configured exercise inside a workout draft. */
export type PlanExercise = ProgramDraft['exercises'][number];

export const PLAN_LIMITS = {
  sets: [1, 10],
  reps: [1, 100],
  rest: [0, 600],
  weight: [0, 1000],
  exercises: 30,
  notes: 300,
} as const;

/** Sensible defaults for a newly added exercise; every value stays editable. */
export function newPlanExercise(exerciseId: string, from?: Partial<PlanExercise>): PlanExercise {
  return {
    exerciseId,
    sets: from?.sets ?? 3,
    reps: from?.reps ?? 10,
    repsMax: from?.repsMax ?? 0,
    rest: from?.rest ?? 90,
    weight: from?.weight ?? 0,
    notes: from?.notes ?? '',
    group: '',
  };
}

export function clamp(value: number, [min, max]: readonly [number, number]) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Consecutive exercises sharing a non-empty group form a superset block. */
export type PlanBlock = { start: number; end: number; superset: boolean };

export function planBlocks(exercises: Pick<PlanExercise, 'group'>[]): PlanBlock[] {
  const blocks: PlanBlock[] = [];
  for (let i = 0; i < exercises.length; i++) {
    const last = blocks[blocks.length - 1];
    const group = exercises[i].group;
    if (last && group && exercises[last.end].group === group) {
      last.end = i;
      last.superset = true;
    } else blocks.push({ start: i, end: i, superset: false });
  }
  return blocks;
}

/** Superset letter (A, B, …) for each exercise index, or '' when it is not in a superset. */
export function supersetLabels(exercises: Pick<PlanExercise, 'group'>[]): string[] {
  const labels = exercises.map(() => '');
  let letter = 0;
  for (const block of planBlocks(exercises)) {
    if (!block.superset) continue;
    const label = String.fromCharCode(65 + (letter++ % 26));
    for (let i = block.start; i <= block.end; i++) labels[i] = label;
  }
  return labels;
}

function freshGroup(used: Set<string>) {
  for (let n = 1; ; n++) {
    const label = `S${n}`;
    if (!used.has(label)) return label;
  }
}

/**
 * Keeps group labels meaningful after edits: a label belongs to exactly one run of
 * neighbouring exercises, single-exercise runs are cleared, and existing labels are kept.
 */
export function normalizeGroups<T extends Pick<PlanExercise, 'group'>>(exercises: T[]): T[] {
  const next = exercises.map((row) => ({ ...row }));
  const used = new Set<string>();
  for (const block of planBlocks(next)) {
    if (!block.superset) {
      next[block.start].group = '';
      continue;
    }
    let label = next[block.start].group;
    if (used.has(label)) label = freshGroup(used);
    used.add(label);
    for (let i = block.start; i <= block.end; i++) next[i].group = label;
  }
  return next;
}

/** True when exercise `index` and the one after it are performed as a superset. */
export function linkedWithNext(exercises: Pick<PlanExercise, 'group'>[], index: number) {
  const a = exercises[index]?.group;
  return !!a && exercises[index + 1]?.group === a;
}

/** Links or unlinks exercise `index` with the next one, merging or splitting supersets. */
export function toggleSuperset<T extends Pick<PlanExercise, 'group'>>(
  exercises: T[],
  index: number,
): T[] {
  if (index < 0 || index >= exercises.length - 1) return exercises;
  const next = exercises.map((row) => ({ ...row }));
  const used = new Set(next.map((row) => row.group).filter(Boolean));
  if (linkedWithNext(next, index)) {
    // Split: everything after `index` in this run moves to a new group.
    const old = next[index].group;
    const label = freshGroup(used);
    for (let i = index + 1; i < next.length && next[i].group === old; i++) next[i].group = label;
  } else {
    const label = next[index].group || next[index + 1].group || freshGroup(used);
    const nextRun = next[index + 1].group;
    next[index].group = label;
    next[index + 1].group = label;
    for (let i = index + 2; nextRun && i < next.length && next[i].group === nextRun; i++)
      next[i].group = label;
  }
  return normalizeGroups(next);
}

/** Moves one exercise, keeping supersets contiguous. */
export function moveExercise<T extends Pick<PlanExercise, 'group'>>(
  exercises: T[],
  from: number,
  to: number,
): T[] {
  if (from === to || from < 0 || to < 0 || from >= exercises.length || to >= exercises.length)
    return exercises;
  const next = [...exercises];
  const [row] = next.splice(from, 1);
  // Dropped between two members of a superset, it joins that superset; otherwise it leaves.
  const before = next[to - 1]?.group;
  const join = before && next[to]?.group === before ? before : '';
  next.splice(to, 0, { ...row, group: join });
  return normalizeGroups(next);
}

/** Average repetitions performed per set, using the middle of a range. */
export function averageReps(row: Pick<PlanExercise, 'reps' | 'repsMax'>) {
  return row.repsMax > row.reps ? (row.reps + row.repsMax) / 2 : row.reps;
}

/** Seconds of work for one set: about 3 s per repetition plus set-up, never under 25 s. */
export function setSeconds(row: Pick<PlanExercise, 'reps' | 'repsMax'>) {
  return Math.max(25, Math.round(averageReps(row) * 3 + 10));
}

const TRANSITION_SECONDS = 60;

/**
 * Estimated workout length in minutes. Straight sets rest between every set; supersets
 * cycle through their exercises and rest once per round (using the longest rest set).
 */
export function estimateMinutes(
  exercises: Pick<PlanExercise, 'sets' | 'reps' | 'repsMax' | 'rest' | 'group'>[],
) {
  if (!exercises.length) return 0;
  let seconds = 0;
  for (const block of planBlocks(exercises)) {
    const rows = exercises.slice(block.start, block.end + 1);
    const rounds = Math.max(...rows.map((row) => row.sets));
    const rest = Math.max(...rows.map((row) => row.rest));
    seconds += rows.reduce((sum, row) => sum + row.sets * setSeconds(row), 0);
    seconds += Math.max(0, rounds - 1) * rest;
    seconds += TRANSITION_SECONDS;
  }
  return Math.max(1, Math.round(seconds / 60));
}

export function totalSets(exercises: Pick<PlanExercise, 'sets'>[]) {
  return exercises.reduce((sum, row) => sum + row.sets, 0);
}

/** Muscle groups ordered by how many sets target them. */
export function targetMuscles(
  exercises: Pick<PlanExercise, 'exerciseId' | 'sets'>[],
  muscleOf: (exerciseId: string) => string | undefined,
) {
  const sets = new Map<string, number>();
  for (const row of exercises) {
    const muscle = muscleOf(row.exerciseId);
    if (muscle) sets.set(muscle, (sets.get(muscle) || 0) + row.sets);
  }
  return [...sets.entries()].sort((a, b) => b[1] - a[1]).map(([muscle]) => muscle);
}

export function repsLabel(row: Pick<PlanExercise, 'reps' | 'repsMax'>) {
  return row.repsMax > row.reps ? `${row.reps}–${row.repsMax}` : String(row.reps);
}

/** "1:30" style rest label; whole minutes drop the seconds. */
export function restLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!minutes) return `${rest}`;
  return rest ? `${minutes}:${String(rest).padStart(2, '0')}` : `${minutes}:00`;
}

export function parseDays(days: string) {
  return days.split(',').filter(Boolean).map(Number);
}

export function toggleDay(days: string, day: number) {
  const set = new Set(parseDays(days));
  if (set.has(day)) set.delete(day);
  else set.add(day);
  return [...set].sort().join(',');
}

/** Replaces one weekday with another (moving a workout in the weekly schedule). */
export function moveDay(days: string, from: number, to: number) {
  const set = new Set(parseDays(days));
  set.delete(from);
  set.add(to);
  return [...set].sort().join(',');
}

/** Display order of weekdays: Sunday-first in Hebrew, Monday-first in English. */
export function weekOrder(lang: string) {
  return lang === 'he' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
}

export type PlanIssue =
  | 'workoutNameRequired'
  | 'workoutDayRequired'
  | 'addExercise'
  | 'tooManyExercises'
  | 'repRangeInvalid'
  | 'planValueInvalid';

/** Validation issues for a draft, keyed by field ('name', 'days', 'exercises' or an index). */
export function validatePlan(draft: ProgramDraft) {
  const issues: { field: string; issue: PlanIssue }[] = [];
  if (!draft.name.trim()) issues.push({ field: 'name', issue: 'workoutNameRequired' });
  if (!draft.template && !parseDays(draft.days).length)
    issues.push({ field: 'days', issue: 'workoutDayRequired' });
  if (!draft.exercises.length) issues.push({ field: 'exercises', issue: 'addExercise' });
  if (draft.exercises.length > PLAN_LIMITS.exercises)
    issues.push({ field: 'exercises', issue: 'tooManyExercises' });
  draft.exercises.forEach((row, index) => {
    const inRange = (value: number, [min, max]: readonly [number, number], integer = true) =>
      Number.isFinite(value) &&
      value >= min &&
      value <= max &&
      (!integer || Number.isInteger(value));
    if (row.repsMax && row.repsMax < row.reps)
      issues.push({ field: String(index), issue: 'repRangeInvalid' });
    else if (
      !inRange(row.sets, PLAN_LIMITS.sets) ||
      !inRange(row.reps, PLAN_LIMITS.reps) ||
      !inRange(row.rest, PLAN_LIMITS.rest) ||
      !inRange(row.weight, PLAN_LIMITS.weight, false) ||
      row.notes.length > PLAN_LIMITS.notes
    )
      issues.push({ field: String(index), issue: 'planValueInvalid' });
  });
  return issues;
}

/** Copies a saved program into an editable draft. */
export function draftFromProgram(program: {
  id?: string;
  name: string;
  description: string;
  days: string;
  template: boolean;
  assignedClientId: string | null;
  exercises: {
    exerciseId: string;
    sets: number;
    reps: number;
    repsMax?: number;
    rest: number;
    weight: number;
    notes?: string;
    group: string;
  }[];
}): ProgramDraft {
  return {
    ...(program.id ? { id: program.id } : {}),
    name: program.name,
    description: program.description,
    weeks: 0,
    days: program.days,
    template: program.template,
    assignedClientId: program.assignedClientId,
    exercises: program.exercises.map((row) => ({
      exerciseId: row.exerciseId,
      sets: row.sets,
      reps: row.reps,
      repsMax: row.repsMax ?? 0,
      rest: row.rest,
      weight: row.weight,
      notes: row.notes ?? '',
      group: row.group,
    })),
  };
}

/** Local autosave of unfinished drafts, one slot per user and per workout being edited. */
export function draftStorageKey(userId: string, programId?: string) {
  return `fitura-workout-draft:${userId}:${programId || 'new'}`;
}

export type StoredDraft = { draft: ProgramDraft; step: number; savedAt: number };

export function readStoredDraft(key: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as StoredDraft;
    if (!value?.draft || !Array.isArray(value.draft.exercises)) return null;
    // Older drafts may predate optional fields.
    value.draft = draftFromProgram({ ...value.draft, id: value.draft.id });
    return value;
  } catch {
    return null;
  }
}

export function writeStoredDraft(key: string, value: StoredDraft) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function clearStoredDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

/** A draft worth keeping: anything typed or picked beyond the untouched defaults. */
export function draftHasContent(draft: ProgramDraft) {
  return !!(draft.name.trim() || draft.description.trim() || draft.exercises.length);
}
