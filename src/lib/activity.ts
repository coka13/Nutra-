import { z } from 'zod';

export const activityKinds = [
  'walking',
  'running',
  'cycling',
  'swimming',
  'aerobics',
  'rowing',
  'elliptical',
  'dancing',
  'otherCardio',
] as const;
export const activityDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (day) => Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day,
  );
export const cardioInput = z.object({
  kind: z.enum(activityKinds),
  minutes: z.number().positive().max(1440),
  distanceKm: z.number().nonnegative().max(1000).nullable().optional(),
  date: activityDate,
  externalId: z.string().min(1).max(200),
});
export const healthSyncInput = z.object({
  source: z.enum(['apple-health', 'health-connect']),
  date: activityDate,
  steps: z.number().int().nonnegative().max(200000).nullable(),
  // Optional so older app builds that only send steps keep working.
  activeCalories: z.number().int().nonnegative().max(20000).nullable().default(null),
  distanceKm: z.number().nonnegative().max(1000).nullable().default(null),
  activities: z.array(cardioInput).max(200),
});
export type HealthSnapshot = z.input<typeof healthSyncInput>;
export type ActivitySummary = {
  steps: {
    steps: number;
    activeCalories: number | null;
    distanceKm: number | null;
    source: string;
    syncedAt: string;
  } | null;
  activities: {
    id: string;
    kind: string;
    minutes: number;
    distanceKm: number | null;
    date: string;
    source: string;
  }[];
};
