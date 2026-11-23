type Clock = {
  elapsedSeconds: number;
  elapsedMilliseconds: number | null;
  lastResumedAt: Date | string;
  status: string;
};

export function workoutMillis(workout: Clock, now: number) {
  const accumulated = workout.elapsedMilliseconds ?? workout.elapsedSeconds * 1000;
  return (
    accumulated +
    (workout.status === 'ACTIVE' ? Math.max(0, now - new Date(workout.lastResumedAt).getTime()) : 0)
  );
}

export function workoutClockTransition(workout: Clock, now: Date) {
  const elapsedMilliseconds = workoutMillis(workout, +now);
  return {
    elapsedMilliseconds,
    elapsedSeconds: Math.floor(elapsedMilliseconds / 1000),
    lastResumedAt: now,
  };
}

export function currentWorkout<T extends { status: string }>(workouts: T[]) {
  return (
    workouts.find((workout) => workout.status === 'ACTIVE') ??
    workouts.find((workout) => workout.status === 'PAUSED')
  );
}
