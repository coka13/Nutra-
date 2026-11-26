import { db } from './db';

type ExerciseLike = {
  id: string;
  nameEn: string;
  nameHe: string;
  instructionsEn: string;
  instructionsHe: string;
  muscle: string;
  difficulty: string;
};

let exerciseCache: { at: number; rows: Awaited<ReturnType<typeof db.exerciseOverride.findMany>> } | null = null;
let translationCache: { at: number; rows: Record<string, { en?: string; he?: string }> } | null = null;
const TTL = 15000;

export function invalidateContentCaches() {
  exerciseCache = null;
  translationCache = null;
}

export async function exerciseOverrides() {
  if (exerciseCache && Date.now() - exerciseCache.at < TTL) return exerciseCache.rows;
  const rows = await db.exerciseOverride.findMany().catch(() => []);
  exerciseCache = { at: Date.now(), rows };
  return rows;
}

/** Overlays administrator edits on catalog rows and drops exercises hidden by an admin. */
export function overlayExercise<T extends ExerciseLike>(
  row: T,
  override: Awaited<ReturnType<typeof exerciseOverrides>>[number] | undefined,
): T {
  if (!override) return row;
  return {
    ...row,
    nameEn: override.nameEn || row.nameEn,
    nameHe: override.nameHe || row.nameHe,
    instructionsEn: override.instructionsEn || row.instructionsEn,
    instructionsHe: override.instructionsHe || row.instructionsHe,
    muscle: override.muscle || row.muscle,
    difficulty: override.difficulty || row.difficulty,
  };
}

export async function applyExerciseOverrides<T extends ExerciseLike>(rows: T[]): Promise<T[]> {
  const overrides = await exerciseOverrides();
  if (!overrides.length) return rows;
  const byId = new Map(overrides.map((row) => [row.exerciseId, row]));
  return rows.filter((row) => !byId.get(row.id)?.hidden).map((row) => overlayExercise(row, byId.get(row.id)));
}

/** Translation overrides keyed by message key; only non-empty values are returned. */
export async function translationOverrides() {
  if (translationCache && Date.now() - translationCache.at < TTL) return translationCache.rows;
  const rows = await db.translationOverride.findMany().catch(() => []);
  const map: Record<string, { en?: string; he?: string }> = {};
  for (const row of rows)
    map[row.key] = { ...(row.en ? { en: row.en } : {}), ...(row.he ? { he: row.he } : {}) };
  translationCache = { at: Date.now(), rows: map };
  return map;
}
