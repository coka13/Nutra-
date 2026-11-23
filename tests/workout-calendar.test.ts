import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Program } from '../src/lib/types';
import { workoutCalendar, type CalendarWorkout } from '../src/lib/workout-calendar';

const program = (overrides: Partial<Program> = {}): Program =>
  ({
    id: 'plan',
    name: 'Weekly strength',
    ownerId: 'me',
    assignedClientId: null,
    template: false,
    createdAt: '2026-11-01T10:00:00Z',
    days: '0,1,2,3,4,5,6',
    weeks: 0,
    ...overrides,
  }) as Program;
const session = (overrides: Partial<CalendarWorkout> = {}): CalendarWorkout => ({
  id: 'session',
  name: 'Strength',
  programId: 'plan',
  startedAt: '2026-11-20T10:00:00Z',
  status: 'FINISHED',
  sets: [{ completed: true }],
  ...overrides,
});
const now = new Date('2026-11-22T12:00:00Z');

test('calendar merges completed sessions, marks past days missed and keeps today and future pending', () => {
  const entries = workoutCalendar(
    [program()],
    [session(), session({ id: 'empty', startedAt: '2026-11-21T10:00:00Z', sets: [] })],
    'me',
    '2026-11',
    'Asia/Jerusalem',
    now,
  );
  assert.equal(entries.length, 30);
  assert.equal(entries.find((entry) => entry.date === '2026-11-20')?.status, 'workoutDone');
  assert.equal(entries.find((entry) => entry.date === '2026-11-21')?.status, 'workoutMissed');
  assert.equal(entries.find((entry) => entry.date === '2026-11-22')?.status, 'workoutPending');
  assert.equal(entries.find((entry) => entry.date === '2026-11-23')?.status, 'workoutPending');
});

test('calendar respects creation, legacy duration, weekdays and excludes templates and other clients', () => {
  const entries = workoutCalendar(
    [
      program({ days: '1', weeks: 1, createdAt: '2026-11-08T10:00:00Z' }),
      program({ id: 'template', template: true }),
      program({ id: 'client', assignedClientId: 'someone-else' }),
      program({ id: 'foreign', ownerId: 'someone-else' }),
    ],
    [],
    'me',
    '2026-11',
    'UTC',
    now,
  );
  assert.deepEqual(
    entries.map((entry) => entry.date),
    ['2026-11-09'],
  );
});

test('calendar uses profile timezone for midnight boundaries and includes unscheduled or deleted programs', () => {
  const entries = workoutCalendar(
    [program({ ownerId: 'coach', assignedClientId: 'me', days: '1' })],
    [
      session({ startedAt: '2026-11-22T23:30:00Z' }),
      session({ id: 'free', programId: null, startedAt: '2026-11-21T12:00:00Z' }),
      session({ id: 'deleted', programId: 'deleted', startedAt: '2026-11-19T12:00:00Z' }),
      session({ id: 'other-month', startedAt: '2026-10-31T10:00:00Z' }),
    ],
    'me',
    '2026-11',
    'Asia/Jerusalem',
    new Date('2026-11-22T23:45:00Z'),
  );
  assert.equal(entries.find((entry) => entry.date === '2026-11-23')?.status, 'workoutDone');
  assert.equal(entries.find((entry) => entry.id === 'session-free')?.status, 'workoutDone');
  assert.equal(entries.find((entry) => entry.id === 'session-deleted')?.status, 'workoutDone');
  assert(!entries.some((entry) => entry.id === 'session-other-month'));
});
