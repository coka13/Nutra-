import type { Prisma } from '@prisma/client';

const dayMs = 86_400_000;
function localDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export async function clientAdherence(
  db: Prisma.TransactionClient,
  coachId: string,
  clientId: string,
  now = new Date(),
) {
  const [profile, programs, sessions] = await Promise.all([
    db.profile.findUnique({ where: { userId: clientId }, select: { timezone: true } }),
    db.program.findMany({ where: { ownerId: coachId, assignedClientId: clientId } }),
    db.workoutSession.findMany({
      where: {
        userId: clientId,
        programId: { not: null },
        status: 'FINISHED',
        startedAt: { gte: new Date(+now - 30 * dayMs) },
        sets: { some: { completed: true } },
      },
      select: { programId: true, startedAt: true },
    }),
  ]);
  const timeZone = profile?.timezone ?? 'Asia/Jerusalem';
  const today = new Date(localDate(now, timeZone));
  const performed = new Set(
    sessions.map((workout) => `${workout.programId}:${localDate(workout.startedAt, timeZone)}`),
  );
  const missed: { programId: string; date: string }[] = [];
  let completed = 0;
  for (const program of programs) {
    const first = +new Date(localDate(program.createdAt, timeZone));
    const schedule = new Set(program.days.split(',').map(Number));
    for (let offset = 1; offset <= 28; offset++) {
      const date = new Date(+today - offset * dayMs);
      if (
        +date < first ||
        (program.weeks > 0 && +date >= first + program.weeks * 7 * dayMs) ||
        !schedule.has(date.getUTCDay())
      )
        continue;
      const key = date.toISOString().slice(0, 10);
      if (performed.has(`${program.id}:${key}`)) completed++;
      else missed.push({ programId: program.id, date: key });
    }
  }
  return { completed, scheduled: completed + missed.length, missed };
}
