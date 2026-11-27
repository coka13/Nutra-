/**
 * Brings the sets of a workout in progress in line with an edited plan.
 *
 * Sets are grouped into blocks: one block per plan entry (position + exercise). Each new plan
 * entry claims the first unclaimed old block of the same exercise, so reordering, adding and
 * removing entries keeps what was already logged. Completed sets are never changed or removed.
 */
export type LiveSet = {
  id: string;
  exerciseId: string;
  position: number;
  setIndex: number;
  reps: number;
  weight: number;
  restSeconds: number;
  completed: boolean;
};
export type PlanRow = {
  exerciseId: string;
  position?: number;
  sets: number;
  reps: number;
  weight: number;
  rest: number;
};
export type LiveSyncPlan = {
  update: { id: string; data: Partial<Omit<LiveSet, 'id' | 'exerciseId' | 'completed'>> }[];
  create: Omit<LiveSet, 'id' | 'completed'>[];
  remove: string[];
};

export function planLiveSync(sets: LiveSet[], previous: PlanRow[], rows: PlanRow[]): LiveSyncPlan {
  const plan: LiveSyncPlan = { update: [], create: [], remove: [] };
  const blocks = new Map<string, LiveSet[]>();
  for (const set of [...sets].sort((a, b) => a.position - b.position || a.setIndex - b.setIndex)) {
    const key = `${set.position}:${set.exerciseId}`;
    blocks.set(key, [...(blocks.get(key) ?? []), set]);
  }
  const unclaimed = [...blocks.values()];
  rows.forEach((row, position) => {
    const index = unclaimed.findIndex((block) => block[0].exerciseId === row.exerciseId);
    const block = index < 0 ? [] : unclaimed.splice(index, 1)[0];
    const before = block.length
      ? previous.find(
          (p) => p.position === block[0].position && p.exerciseId === block[0].exerciseId,
        )
      : undefined;
    const bySetIndex = new Map(block.map((set) => [set.setIndex, set]));
    for (const set of block) {
      if (!set.completed && set.setIndex >= row.sets) {
        plan.remove.push(set.id);
        continue;
      }
      const data: LiveSyncPlan['update'][number]['data'] = {};
      if (set.position !== position) data.position = position;
      if (!set.completed) {
        if (set.restSeconds !== row.rest) data.restSeconds = row.rest;
        // Only a value the plan author changed overrides what the trainee is carrying forward.
        if (before && before.reps !== row.reps && set.reps !== row.reps) data.reps = row.reps;
        if (before && before.weight !== row.weight && set.weight !== row.weight)
          data.weight = row.weight;
      }
      if (Object.keys(data).length) plan.update.push({ id: set.id, data });
    }
    // New sets continue from the last weight used in this block.
    const latest = block.filter((set) => set.setIndex < row.sets).at(-1);
    for (let setIndex = 0; setIndex < row.sets; setIndex++)
      if (!bySetIndex.has(setIndex))
        plan.create.push({
          exerciseId: row.exerciseId,
          position,
          setIndex,
          reps: row.reps,
          weight:
            before && before.weight !== row.weight ? row.weight : (latest?.weight ?? row.weight),
          restSeconds: row.rest,
        });
  });
  // Entries removed from the plan keep their logged sets, listed after the plan.
  unclaimed.forEach((block, offset) => {
    for (const set of block) {
      if (!set.completed) plan.remove.push(set.id);
      else if (set.position !== rows.length + offset)
        plan.update.push({ id: set.id, data: { position: rows.length + offset } });
    }
  });
  return plan;
}
