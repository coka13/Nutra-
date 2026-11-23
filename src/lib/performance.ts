import type { Prisma } from '@prisma/client';

type SetMetrics = { weight: number; reps: number; completed: boolean };
type Metrics = { weight: number; reps: number; estimate: number; volume: number };
export function setMetrics(sets: SetMetrics[]): Metrics {
  return sets
    .filter((set) => set.completed && set.reps > 0)
    .reduce(
      (best, set) => ({
        weight: Math.max(best.weight, set.weight),
        reps: Math.max(best.reps, set.reps),
        estimate: Math.max(best.estimate, set.weight * (set.reps === 1 ? 1 : 1 + set.reps / 30)),
        volume: best.volume + set.weight * set.reps,
      }),
      { weight: 0, reps: 0, estimate: 0, volume: 0 },
    );
}
export function reachedLiveRecord(
  before: Metrics,
  after: Metrics,
  prior: Record<keyof Metrics, number | null>,
) {
  return (
    (['weight', 'reps', 'estimate'] as const).some(
      (key) => after[key] > Math.max(before[key], prior[key] ?? 0),
    ) ||
    (before.volume <= (prior.volume ?? 0) && after.volume > (prior.volume ?? 0))
  );
}

export async function recordLivePerformance(
  tx: Prisma.TransactionClient,
  sessionId: string,
  userId: string,
  exerciseId: string,
  beforeSets: SetMetrics[],
) {
  const sets = await tx.workoutSet.findMany({ where: { sessionId, exerciseId } });
  const { _max: prior } = await tx.exercisePerformance.aggregate({
    where: { userId, exerciseId },
    _max: { weight: true, reps: true, estimate: true, volume: true },
  });
  const achieved = reachedLiveRecord(setMetrics(beforeSets), setMetrics(sets), prior);
  if (
    achieved &&
    !(await tx.notification.findFirst({ where: { userId, key: 'newRecord', detail: sessionId } }))
  )
    await tx.notification.create({ data: { userId, key: 'newRecord', detail: sessionId } });
  return achieved;
}

export async function recordPerformance(
  tx: Prisma.TransactionClient,
  sessionId: string,
  userId: string,
  finishedAt: Date,
) {
  const sets = await tx.workoutSet.findMany({
    where: { sessionId, completed: true, reps: { gt: 0 } },
  });
  const metrics = new Map<
    string,
    { weight: number; reps: number; estimate: number; volume: number }
  >();
  for (const set of sets) {
    const current = metrics.get(set.exerciseId) ?? { weight: 0, reps: 0, estimate: 0, volume: 0 };
    current.weight = Math.max(current.weight, set.weight);
    current.reps = Math.max(current.reps, set.reps);
    current.estimate = Math.max(
      current.estimate,
      set.weight * (set.reps === 1 ? 1 : 1 + set.reps / 30),
    );
    current.volume += set.weight * set.reps;
    metrics.set(set.exerciseId, current);
  }
  const achievements: string[] = [];
  for (const [exerciseId, values] of metrics) {
    const { _max: prior } = await tx.exercisePerformance.aggregate({
      where: { userId, exerciseId },
      _max: { weight: true, reps: true, estimate: true, volume: true },
    });
    if (
      values.weight > (prior.weight ?? 0) ||
      values.reps > (prior.reps ?? 0) ||
      values.estimate > (prior.estimate ?? 0) ||
      values.volume > (prior.volume ?? 0)
    ) {
      achievements.push(exerciseId);
    }
    await tx.exercisePerformance.create({
      data: { sessionId, userId, exerciseId, finishedAt, ...values },
    });
  }
  if (achievements.length) {
    const coaches = await tx.coachRelationship.findMany({
      where: { clientId: userId, status: 'ACTIVE' },
      select: { coachId: true },
    });
    const alreadyNotified = await tx.notification.findFirst({
      where: { userId, key: 'newRecord', detail: sessionId },
    });
    await tx.notification.createMany({
      data: [
        ...(!alreadyNotified ? [{ userId, key: 'newRecord', detail: sessionId }] : []),
        ...coaches.map(({ coachId }) => ({ userId: coachId, key: 'clientRecord', detail: userId })),
      ],
    });
  }
}
