import type { Program, Workout } from './types';

export type CalendarWorkout = Pick<
  Workout,
  'id' | 'name' | 'programId' | 'startedAt' | 'status'
> & {
  sets: { completed: boolean }[];
};
export type WorkoutCalendarEntry = {
  id: string;
  date: string;
  name: string;
  status: 'workoutDone' | 'workoutMissed' | 'workoutPending';
};

export function calendarDate(date: Date | string, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
}

export function workoutCalendar(
  programs: Program[],
  workouts: CalendarWorkout[],
  userId: string,
  month: string,
  timeZone: string,
  now = new Date(),
): WorkoutCalendarEntry[] {
  const today = calendarDate(now, timeZone);
  const entries: WorkoutCalendarEntry[] = [];
  const scheduled = new Map<string, WorkoutCalendarEntry>();
  const [year, monthNumber] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  for (const program of programs) {
    if (
      program.template ||
      (program.assignedClientId ? program.assignedClientId !== userId : program.ownerId !== userId)
    )
      continue;
    const first = calendarDate(program.createdAt, timeZone);
    const end = program.weeks > 0 ? +new Date(first) + program.weeks * 7 * 86_400_000 : Infinity;
    const weekdays = new Set(program.days.split(',').filter(Boolean).map(Number));
    for (let day = 1; day <= days; day++) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      if (date < first || +new Date(date) >= end || !weekdays.has(new Date(date).getUTCDay()))
        continue;
      const entry: WorkoutCalendarEntry = {
        id: `plan-${program.id}-${date}`,
        date,
        name: program.name,
        status: date < today ? 'workoutMissed' : 'workoutPending',
      };
      entries.push(entry);
      scheduled.set(`${program.id}:${date}`, entry);
    }
  }
  for (const workout of workouts) {
    const date = calendarDate(workout.startedAt, timeZone);
    if (!date.startsWith(`${month}-`)) continue;
    const done = workout.status === 'FINISHED' && workout.sets.some((set) => set.completed);
    const entry = workout.programId ? scheduled.get(`${workout.programId}:${date}`) : undefined;
    if (entry) {
      if (done) entry.status = 'workoutDone';
    } else {
      entries.push({
        id: `session-${workout.id}`,
        date,
        name: workout.name,
        status: done ? 'workoutDone' : date < today ? 'workoutMissed' : 'workoutPending',
      });
    }
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
