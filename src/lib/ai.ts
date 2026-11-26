import type { PrismaClient, Profile } from '@prisma/client';
import { catalogExercises, hasExerciseAnimation } from './free-exercises';
import { normalizeFoodText, searchLocalFoods } from './food-search';
import { recordAiUsage, resolveRoutes } from './ai-governance';

export class AiUnavailable extends Error {}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };
type ChatMessage = { role: 'system' | 'user'; content: string | ContentPart[] };

/**
 * Calls an OpenAI-compatible chat endpoint. Routes come from administrator-configured
 * providers (default + fallbacks) or, when none are set, the OPENAI_* environment variables.
 * Free models are often rate-limited, so each backup model gets its own attempt.
 * Every attempt is metered (tokens, estimated cost, latency, failure class; never content).
 */
export async function chat(
  messages: ChatMessage[],
  maxTokens: number,
  json = false,
  kind: 'text' | 'vision' = 'text',
) {
  const routes = await resolveRoutes(kind);
  if (!routes.length) throw new AiUnavailable('no api key');
  const failures: string[] = [];
  const deadline = Date.now() + (json ? 110000 : 50000);
  for (const route of routes) {
    const { model } = route;
    const remaining = deadline - Date.now();
    if (remaining < 5000) break;
    const started = Date.now();
    const fail = (reason: string, usage?: { prompt_tokens?: number; completion_tokens?: number }) => {
      failures.push(`${route.provider}/${model}: ${reason}`);
      return recordAiUsage({
        route,
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        success: false,
        latencyMs: Date.now() - started,
        error: reason,
      });
    };
    try {
      const response = await fetch(`${route.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(Math.min(remaining, json ? 70000 : 40000)),
        headers: {
          Authorization: `Bearer ${route.key}`,
          'Content-Type': 'application/json',
          ...(process.env.APP_URL && { 'HTTP-Referer': process.env.APP_URL }),
          'X-Title': 'Fitura+',
        },
        body: JSON.stringify({
          model,
          messages,
          // Headroom for models that reason before answering.
          max_tokens: maxTokens,
        }),
      });
      if (!response.ok) {
        await fail(`HTTP ${response.status}`);
        continue;
      }
      const data = await response.json().catch(() => null);
      const choice = data?.choices?.[0];
      const answer = choice?.message?.content;
      if (typeof answer === 'string' && answer.trim()) {
        await recordAiUsage({
          route,
          promptTokens: data?.usage?.prompt_tokens ?? 0,
          completionTokens: data?.usage?.completion_tokens ?? 0,
          success: true,
          latencyMs: Date.now() - started,
        });
        return answer.trim();
      }
      await fail(`empty (${choice?.finish_reason})`, data?.usage);
    } catch (error) {
      await fail(error instanceof Error ? error.name : 'error');
    }
  }
  console.warn('[ai] all models failed:', failures.join('; '));
  throw new AiUnavailable(failures.join('; '));
}

/** Extracts the first JSON object from a model reply (tolerates ``` fences and chatter). */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export const SAFETY = `Do not give diagnoses, injury treatment, extreme exercise, weight-loss or restrictive calorie targets. Encourage balanced meals, rest and accessible movement. Refer medical or eating-disorder concerns to a qualified professional. All plans are drafts that a human reviews before saving.`;

const equipmentAllowed: Record<string, string[]> = {
  bodyweight: ['bodyweight', 'body weight', 'bands', 'band', 'other'],
  dumbbells: [
    'bodyweight',
    'body weight',
    'bands',
    'band',
    'other',
    'dumbbells',
    'dumbbell',
    'kettlebells',
    'kettlebell',
  ],
};

type Candidate = { ref: number; id: string; nameEn: string; nameHe: string; muscle: string };

/**
 * A compact, diverse slice of the catalog the model may choose from. Shorter names first:
 * they are usually the foundational movements ("Barbell Squat" before variations).
 */
export function exerciseCandidates(equipment: string, perMuscle = 14): Candidate[] {
  const allowed = equipmentAllowed[equipment];
  const byMuscle = new Map<string, typeof catalogExercises>();
  for (const exercise of catalogExercises) {
    if (!hasExerciseAnimation(exercise)) continue;
    if (allowed && !allowed.includes(exercise.equipment)) continue;
    const list = byMuscle.get(exercise.muscle) ?? [];
    list.push(exercise);
    byMuscle.set(exercise.muscle, list);
  }
  const picked: Omit<Candidate, 'ref'>[] = [];
  const seenNames = new Set<string>();
  for (const list of byMuscle.values()) {
    list
      .slice()
      .sort(
        (a, b) =>
          Number(b.difficulty === 'beginner') - Number(a.difficulty === 'beginner') ||
          a.nameEn.length - b.nameEn.length,
      )
      .filter((exercise) => {
        const key = exercise.nameEn.toLowerCase();
        if (seenNames.has(key)) return false;
        seenNames.add(key);
        return true;
      })
      .slice(0, perMuscle)
      .forEach(({ id, nameEn, nameHe, muscle }) => picked.push({ id, nameEn, nameHe, muscle }));
  }
  return picked.map((row, i) => ({ ...row, ref: i + 1 }));
}

export function profileSummary(profile: Profile | null) {
  if (!profile) return 'No profile details.';
  return [
    `goal: ${profile.goal}`,
    `experience: ${profile.experience}`,
    `equipment: ${profile.equipment}`,
    `training days per week: ${profile.frequency}`,
    `session length (min): ${profile.duration}`,
    profile.dietary && `dietary preferences: ${profile.dietary}`,
    profile.limitations && `limitations to respect: ${profile.limitations}`,
    profile.calorieTarget && `daily calorie target: ${profile.calorieTarget}`,
    profile.proteinTarget && `daily protein target (g): ${profile.proteinTarget}`,
  ]
    .filter(Boolean)
    .join('\n');
}

const int = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const str = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export type WorkoutDraft = {
  name: string;
  description: string;
  days: number[];
  exercises: {
    exerciseId: string;
    nameEn: string;
    nameHe: string;
    muscle: string;
    sets: number;
    reps: number;
    rest: number;
  }[];
};

export async function draftWorkout(request: string, profile: Profile | null, lang: string) {
  const equipment = profile?.equipment || 'gym';
  const candidates = exerciseCandidates(equipment);
  const list = candidates.map((c) => `${c.ref}|${c.nameEn}|${c.muscle}`).join('\n');
  const frequency = profile?.frequency ?? 3;
  const reply = await chat(
    [
      {
        role: 'system',
        content: `You design one weekly workout for the Fitura+ app. ${SAFETY}
Use ONLY exercises from this catalog, referenced by their number (format: number|name|muscle):
${list}

Reply with JSON only, no prose:
{"name": string, "description": string, "days": number[], "exercises": [{"ref": number, "sets": number, "reps": number, "rest": number}]}
- name and description in ${lang === 'he' ? 'Hebrew' : 'English'}; description: 1-2 sentences.
- days: weekdays to train, 0=Sunday..6=Saturday; about ${frequency} days unless the request says otherwise.
- 4 to 8 exercises, each ref used once; sets 1-6, reps 1-30, rest seconds 30-180.
- Fit the session length and experience level, and respect any limitations.`,
      },
      {
        role: 'user',
        content: `Trainee profile:\n${profileSummary(profile)}\n\nRequest: ${request}`,
      },
    ],
    4000,
    true,
  );
  const json = parseJsonObject(reply);
  if (!json) throw new AiUnavailable();
  const byRef = new Map(candidates.map((c) => [c.ref, c]));
  const used = new Set<string>();
  const exercises: WorkoutDraft['exercises'] = [];
  for (const row of Array.isArray(json.exercises) ? json.exercises : []) {
    const item = row as Record<string, unknown>;
    const candidate = byRef.get(Number(item.ref));
    if (!candidate || used.has(candidate.id) || exercises.length >= 12) continue;
    used.add(candidate.id);
    exercises.push({
      exerciseId: candidate.id,
      nameEn: candidate.nameEn,
      nameHe: candidate.nameHe,
      muscle: candidate.muscle,
      sets: int(item.sets, 1, 10, 3),
      reps: int(item.reps, 1, 100, 10),
      rest: int(item.rest, 0, 600, 90),
    });
  }
  if (!exercises.length) throw new AiUnavailable();
  const days = [
    ...new Set(
      (Array.isArray(json.days) ? json.days : [])
        .map(Number)
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    ),
  ].sort();
  return {
    name: str(json.name, 200) || (lang === 'he' ? 'אימון מותאם' : 'Custom workout'),
    description: str(json.description, 1000),
    days: days.length ? days : [0, 2, 4].slice(0, Math.min(3, frequency)),
    exercises,
  } satisfies WorkoutDraft;
}

const meals = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export type MenuDraft = {
  name: string;
  notes: string;
  items: {
    foodId: string;
    nameEn: string;
    nameHe: string;
    grams: number;
    meal: (typeof meals)[number];
    calories: number;
    protein: number;
  }[];
  unmatched: string[];
};

export async function draftMenu(
  db: PrismaClient,
  ownerId: string,
  request: string,
  profile: Profile | null,
  lang: 'en' | 'he',
) {
  const reply = await chat(
    [
      {
        role: 'system',
        content: `You design a one-day balanced menu for the Fitura+ app. ${SAFETY}
Use simple, common, generic foods (as found in a nutrition database), one ingredient per item, e.g. "חזה עוף" / "chicken breast", "אורז לבן מבושל" / "cooked white rice", "יוגורט" / "yogurt". No brands, no composite dishes.

Reply with JSON only, no prose:
{"name": string, "notes": string, "items": [{"he": string, "en": string, "grams": number, "meal": "breakfast"|"lunch"|"dinner"|"snack"}]}
- name and notes in ${lang === 'he' ? 'Hebrew' : 'English'}; notes: 1-3 short practical tips.
- 8 to 18 items across the meals; grams 5-600 per item.
- Respect dietary preferences and limitations.`,
      },
      {
        role: 'user',
        content: `Profile:\n${profileSummary(profile)}\n\nRequest: ${request}`,
      },
    ],
    4000,
    true,
  );
  const json = parseJsonObject(reply);
  if (!json) throw new AiUnavailable();
  const items: MenuDraft['items'] = [];
  const unmatched: string[] = [];
  for (const row of (Array.isArray(json.items) ? json.items : []).slice(0, 25)) {
    const item = row as Record<string, unknown>;
    const he = str(item.he, 80);
    const en = str(item.en, 80);
    const meal = meals.includes(item.meal as never)
      ? (item.meal as MenuDraft['items'][0]['meal'])
      : 'snack';
    const grams = int(item.grams, 1, 2000, 100);
    const queries = lang === 'he' ? [he, en] : [en, he];
    let food = null;
    for (const query of queries.filter(Boolean)) {
      food = (await searchLocalFoods(db, ownerId, query, query === he ? 'he' : 'en', 1))[0];
      if (food) break;
    }
    if (!food) {
      if (he || en) unmatched.push(lang === 'he' ? he || en : en || he);
      continue;
    }
    items.push({
      foodId: food.id,
      nameEn: food.nameEn,
      nameHe: food.nameHe,
      grams,
      meal,
      calories: Math.round((food.calories * grams) / 100),
      protein: Math.round((food.protein * grams) / 10) / 10,
    });
  }
  if (!items.length) throw new AiUnavailable();
  return {
    name: str(json.name, 200) || (lang === 'he' ? 'תפריט מותאם' : 'Custom menu'),
    notes: str(json.notes, 2000),
    items,
    unmatched,
  } satisfies MenuDraft;
}

export type PhotoFoodDraft = {
  /** Catalog food when one matched; otherwise the item is logged from the AI estimate. */
  foodId: string | null;
  nameEn: string;
  nameHe: string;
  grams: number;
  /** Nutrition per 100 g, from the catalog match or the AI estimate. */
  per100: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
};

export type PhotoDraft = { items: PhotoFoodDraft[]; notes: string };

const per100 = (value: unknown, max: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n * 10) / 10)) : 0;
};

const nameWords = (name: string) =>
  normalizeFoodText(name)
    .split(/[\s,()-]+/)
    .filter(Boolean);
const sameWord = (a: string, b: string) =>
  a === b || a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`;
/**
 * Search ranks prefixes first, which suits typing but not automatic matching ("fried egg"
 * would pick "fried eggplant"), so every word of the query must be a whole word of the name.
 */
async function matchCatalogFood(
  db: PrismaClient,
  ownerId: string,
  query: string,
  lang: 'en' | 'he',
) {
  const terms = nameWords(query);
  const candidates = await searchLocalFoods(db, ownerId, query, lang, 15);
  return candidates.find((food) =>
    [food.nameEn, food.nameHe].some((name) => {
      const words = nameWords(name);
      return terms.every((term) => words.some((word) => sameWord(word, term)));
    }),
  );
}

/**
 * Identifies the foods in a meal photo and estimates portions. Each food is matched to the
 * app's database when a plausible entry exists, so logged values come from the catalog;
 * anything else keeps the model's per-100 g estimate. Nothing is saved here.
 */
export async function recognizeMeal(
  db: PrismaClient,
  ownerId: string,
  jpeg: Buffer,
  lang: 'en' | 'he',
  hint = '',
): Promise<PhotoDraft> {
  const reply = await chat(
    [
      {
        role: 'system',
        content: `You identify foods in a meal photo for the Fitura+ food diary. ${SAFETY}
List each distinct food or drink you can see, one ingredient or simple dish per item, using common generic names (as found in a nutrition database), e.g. "חזה עוף צלוי" / "grilled chicken breast", "אורז לבן מבושל" / "cooked white rice". No brands.
Estimate the portion in grams from visual cues (plate size, cutlery, hands). Give typical nutrition per 100 g for that food as prepared.

Reply with JSON only, no prose:
{"items": [{"he": string, "en": string, "grams": number, "calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number}], "notes": string}
- calories is kcal per 100 g (0-900); protein, carbs, fat, fiber are grams per 100 g (0-100).
- grams 1-1500 per item; at most 12 items.
- notes in ${lang === 'he' ? 'Hebrew' : 'English'}: one short sentence on what was hard to judge (hidden oil, sauce, portion), or "".
- If the photo shows no food, reply {"items": [], "notes": "<say so briefly>"}.`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: hint ? `The user adds: ${hint}` : 'What is in this meal?',
          },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}`, detail: 'high' },
          },
        ],
      },
    ],
    3000,
    true,
    'vision',
  );
  const json = parseJsonObject(reply);
  if (!json) throw new AiUnavailable('unparseable');
  const items: PhotoFoodDraft[] = [];
  for (const row of (Array.isArray(json.items) ? json.items : []).slice(0, 12)) {
    const item = row as Record<string, unknown>;
    const he = str(item.he, 80);
    const en = str(item.en, 80);
    if (!he && !en) continue;
    const estimate = {
      calories: per100(item.calories, 900),
      protein: per100(item.protein, 100),
      carbs: per100(item.carbs, 100),
      fat: per100(item.fat, 100),
      fiber: per100(item.fiber, 100),
    };
    let food = null;
    for (const query of (lang === 'he' ? [he, en] : [en, he]).filter(Boolean)) {
      food = await matchCatalogFood(db, ownerId, query, query === he ? 'he' : 'en');
      if (food) break;
    }
    // A loose text match can pick the wrong food ("pizza" -> "pizza sauce"); keep the
    // estimate when the catalog's energy density is far from what the model expects.
    if (food && estimate.calories > 40) {
      const ratio = food.calories / estimate.calories;
      if (ratio < 0.4 || ratio > 2.5) food = null;
    }
    items.push({
      foodId: food?.id ?? null,
      nameEn: food?.nameEn || en || he,
      nameHe: food?.nameHe || he || en,
      grams: int(item.grams, 1, 1500, 100),
      per100: food
        ? {
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
            fiber: food.fiber,
          }
        : estimate,
    });
  }
  return { items, notes: str(json.notes, 500) };
}
