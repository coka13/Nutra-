import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { clientAdherence } from '../src/lib/adherence';

test('ongoing programs remain scheduled past four weeks while legacy durations are respected', async () => {
  const db = {
    profile: { findUnique: async () => ({ timezone: 'UTC' }) },
    program: {
      findMany: async () => [
        { id: 'ongoing', weeks: 0, days: '1,3,5', createdAt: new Date('2026-01-01') },
        { id: 'legacy', weeks: 4, days: '1,3,5', createdAt: new Date('2026-01-01') },
      ],
    },
    workoutSession: {
      findMany: async () => [{ programId: 'ongoing', startedAt: new Date('2026-11-20T12:00:00Z') }],
    },
  } as unknown as Prisma.TransactionClient;
  const result = await clientAdherence(db, 'coach', 'client', new Date('2026-11-21T12:00:00Z'));
  assert.equal(result.scheduled, 12);
  assert.equal(result.completed, 1);
  assert.equal(result.missed.length, 11);
  assert(result.missed.every((entry) => entry.programId === 'ongoing'));
});
