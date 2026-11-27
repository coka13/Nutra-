import type { Exercise } from '@prisma/client';
import data from '@/data/free-exercises.json';
import animatedData from '@/data/animated-exercises.json';
import type { ExerciseDemonstration } from './exercise-demonstrations';
import { smartWorkoutAnimation, smartWorkoutAnimations, smartWorkoutId } from './smartworkout';
import translations from '@/data/exercise-translations-he.json';

const hebrew = translations as Record<
  string,
  { nameHe: string; instructionsHe: string; sourceHash: string }
>;

export const freeExercises = data;
const byId = new Map(data.map((exercise) => ['fe_' + exercise.id, exercise]));
type FreeExercise = (typeof data)[number];
const muscles: Record<string, string> = {
  'middle back': 'upperBack',
  'lower back': 'lowerBack',
};
export function freeCatalogExercise(exercise: FreeExercise): Exercise {
  const primary = exercise.primaryMuscles[0] || 'other';
  return {
    id: 'fe_' + exercise.id,
    nameEn: exercise.name,
    nameHe: hebrew['fe_' + exercise.id].nameHe,
    muscle: exercise.category === 'cardio' ? 'cardio' : muscles[primary] || primary,
    equipment:
      exercise.equipment === 'body only'
        ? 'bodyweight'
        : exercise.equipment === 'dumbbell'
          ? 'dumbbells'
          : exercise.equipment || 'bodyweight',
    difficulty: exercise.level,
    instructionsEn: exercise.instructions.join('\n'),
    instructionsHe: hebrew['fe_' + exercise.id].instructionsHe,
  };
}
const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const animationById = new Map(animatedData.map((row) => [row.id, row]));
const targetMuscles: Record<string, string> = {
  abs: 'abdominals',
  quads: 'quadriceps',
  pectorals: 'chest',
  delts: 'shoulders',
  spine: 'lowerBack',
  'upper back': 'upperBack',
  'cardiovascular system': 'cardio',
  'serratus anterior': 'chest',
  'levator scapulae': 'neck',
};
const freeNames = new Set(data.map((row) => normalizeName(row.name)));
const legacyExercises: Exercise[] = [
  ...data.map(freeCatalogExercise),
  ...animatedData
    .filter((row) => !freeNames.has(normalizeName(row.name)))
    .map((row) => ({
      id: 'fl_' + row.id,
      nameEn: row.name.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()),
      nameHe: hebrew['fl_' + row.id].nameHe,
      muscle: targetMuscles[row.target] || row.target,
      equipment: row.equipment,
      difficulty: 'intermediate',
      instructionsEn: row.instructions.join('\n'),
      instructionsHe: hebrew['fl_' + row.id].instructionsHe,
    })),
];
const coveredPaths = new Set(
  legacyExercises.flatMap((row) => {
    const demo = smartWorkoutAnimation(row.id, row.nameEn);
    return demo ? [demo.path] : [];
  }),
);
const smartMuscle = (row: (typeof smartWorkoutAnimations)[number]) => {
  if (row.tags.includes('CARDIO') && !row.tags.includes('STRENGTH')) return 'cardio';
  const groups: Record<string, string> = {
    CHEST: 'chest',
    SHOULDERS: 'shoulders',
    GLUTEUS: 'glutes',
    BICEPS: 'biceps',
    TRICEPS: 'triceps',
    FOREARMS: 'forearms',
    ABS: 'abdominals',
  };
  if (groups[row.bodyPart]) return groups[row.bodyPart];
  const prefixes =
    row.bodyPart === 'BACK'
      ? [
          ['BACK_LATS', 'lats'],
          ['ERECTOR_SPINAE', 'lowerBack'],
          ['BACK_TRAPEZIUS_UPPER', 'traps'],
        ]
      : [
          ['QUADRICEPS', 'quadriceps'],
          ['BICEPS_FEMORIS', 'hamstrings'],
          ['SEMIMEMBRANOSUS', 'hamstrings'],
          ['SEMITENDINOSUS', 'hamstrings'],
          ['CLAVES', 'calves'],
          ['ADDUCTOR', 'adductors'],
          ['GLUTEUS', 'glutes'],
        ];
  for (const muscle of row.muscles) {
    const match = prefixes.find(([prefix]) => muscle.startsWith(prefix));
    if (match) return match[1];
  }
  return row.bodyPart === 'BACK' ? 'upperBack' : 'quadriceps';
};
const smartExercises: Exercise[] = smartWorkoutAnimations
  .filter((row) => !coveredPaths.has(row.path))
  .map((row) => {
    const id = smartWorkoutId(row.path);
    return {
      id,
      nameEn: row.name,
      nameHe: hebrew[id]?.nameHe || row.name,
      instructionsEn: row.instructions.join('\n'),
      instructionsHe: hebrew[id]?.instructionsHe || row.instructions.join('\n'),
      muscle: smartMuscle(row),
      equipment:
        row.equipment
          .find((item) => !['warmup', 'mobility'].includes(item))
          ?.replace('smith', 'smith machine')
          .replace('pull_up_bar', 'bodyweight') || 'bodyweight',
      difficulty: 'intermediate',
    };
  });
// Keep legacy IDs resolvable for old programs, but new choices all have animation media.
export const catalogExercises: Exercise[] = [...legacyExercises, ...smartExercises];
// The sources overlap under different spellings ("Donkey Calf Raise" / "Donkey Calf Raises"),
// which resolve to the same video. Offer one entry per video; the others stay resolvable by ID
// for saved workouts.
const shownPaths = new Set<string>();
const hiddenDuplicateIds = new Set<string>();
export const demonstratedExercises = catalogExercises.filter((row) => {
  const animation = smartWorkoutAnimation(row.id, row.nameEn);
  if (!animation) return false;
  if (shownPaths.has(animation.path)) {
    hiddenDuplicateIds.add(row.id);
    return false;
  }
  shownPaths.add(animation.path);
  return true;
});
const catalogById = new Map(catalogExercises.map((row) => [row.id, row]));
export function getFreeExercise(id: string) {
  return catalogById.get(id);
}
export function localizeCatalogExercise(exercise: Exercise): Exercise {
  const canonical = catalogById.get(exercise.id);
  if (!canonical) return exercise;
  return {
    ...exercise,
    nameHe: canonical.nameHe,
    instructionsHe: /[\u0590-\u05ff]/.test(exercise.instructionsHe)
      ? exercise.instructionsHe
      : canonical.instructionsHe,
    muscle: canonical.muscle,
    equipment: canonical.equipment,
  };
}
export function completeExerciseLibrary(saved: Exercise[]) {
  const merged = new Map(
    catalogExercises.filter((row) => !hiddenDuplicateIds.has(row.id)).map((row) => [row.id, row]),
  );
  for (const row of saved) {
    if (hiddenDuplicateIds.has(row.id)) continue;
    // Existing plans retain IDs and translations; catalog entries use current muscle groups.
    merged.set(row.id, localizeCatalogExercise(row));
  }
  return [...merged.values()].filter(hasExerciseAnimation).map((row) => ({
    ...row,
    hasDemonstration: !!smartWorkoutAnimation(row.id, row.nameEn),
    demonstration: freeExerciseDemonstration(row.id, row.nameEn).media,
  }));
}
export function hasExerciseAnimation(exercise: Pick<Exercise, 'id' | 'nameEn'>) {
  return !!smartWorkoutAnimation(exercise.id, exercise.nameEn);
}
const bodyParts: Record<string, string[]> = {
  Chest: ['chest'],
  Back: ['lats', 'upperBack', 'lowerBack', 'traps'],
  Shoulders: ['shoulders'],
  'Upper Arms': ['biceps', 'triceps'],
  'Lower Arms': ['forearms'],
  Waist: ['abdominals'],
  'Upper Legs': ['quadriceps', 'hamstrings', 'glutes', 'adductors', 'abductors'],
  'Lower Legs': ['calves'],
  Neck: ['neck'],
  Cardio: ['cardio'],
};
const searchAliases: Record<string, string> = {
  'preacher chair': 'preacher',
  'preacher bench': 'preacher',
  'כיסא כומר': 'preacher',
  'ספסל כומר': 'preacher',
  כומר: 'preacher',
  'יד קדמית': 'biceps',
  'יד אחורית': 'triceps',
  חזה: 'chest',
  גב: 'back',
};
export function loadFreeCatalog(query: {
  name: string;
  category: string;
  bodyPart: string;
  equipment: string;
  offset: number;
  muscle?: string;
  demonstration?: string;
}) {
  const search = searchAliases[query.name.trim().toLowerCase()] || query.name.trim().toLowerCase();
  const filtered = demonstratedExercises.filter((exercise) => {
    if (query.demonstration === 'video' && !smartWorkoutAnimation(exercise.id, exercise.nameEn))
      return false;
    const raw = byId.get(exercise.id);
    const smart = smartWorkoutAnimation(exercise.id, exercise.nameEn);
    const animation = exercise.id.startsWith('fl_')
      ? animationById.get(exercise.id.slice(3))
      : undefined;
    const keywords = [
      exercise.nameEn,
      exercise.nameHe,
      exercise.muscle,
      exercise.equipment,
      ...(smart?.aliases || []),
      ...(raw?.primaryMuscles || []),
      ...(raw?.secondaryMuscles || []),
      ...(animation?.secondaryMuscles || []),
      animation?.bodyPart || '',
    ]
      .join(' ')
      .toLowerCase();
    if (search && !search.split(/\s+/).every((word) => keywords.includes(word))) return false;
    if (query.muscle && exercise.muscle !== query.muscle) return false;
    if (query.bodyPart && !bodyParts[query.bodyPart]?.includes(exercise.muscle)) return false;
    if (query.equipment) {
      const equipmentNames: Record<string, string[]> = {
        'Body Weight': ['bodyweight', 'body weight', 'body only'],
        Dumbbell: ['dumbbells', 'dumbbell'],
        Barbell: ['barbell', 'ez barbell', 'olympic barbell'],
        Cable: ['cable'],
        Band: ['band', 'bands', 'resistance band'],
        Kettlebell: ['kettlebells', 'kettlebell'],
        'Leverage Machine': ['machine', 'leverage machine'],
      };
      const actual = raw?.equipment || exercise.equipment;
      if (!(equipmentNames[query.equipment] || [query.equipment]).includes(actual)) return false;
    }
    if (query.category) {
      const category =
        raw?.category ||
        (exercise.muscle === 'cardio'
          ? 'cardio'
          : /stretch/.test(exercise.nameEn.toLowerCase()) || smart?.tags.includes('STRETCH')
            ? 'stretching'
            : 'strength');
      if (
        query.category === 'strength'
          ? !['strength', 'strongman', 'powerlifting', 'olympic weightlifting'].includes(category)
          : category !== (query.category === 'plyometric' ? 'plyometrics' : query.category)
      )
        return false;
    }
    return true;
  });
  const limit = 36;
  return {
    total: filtered.length,
    offset: query.offset,
    limit,
    results: filtered.slice(query.offset, query.offset + limit).map((exercise) => {
      const demo = freeExerciseDemonstration(exercise.id);
      return {
        ...exercise,
        thumbnail: demo.media?.poster,
        // A few source clips use a textured gray floor; they still animate, as in the detail view.
        animation: demo.media?.gif,
        hasVideo: !!demo.media,
      };
    }),
  };
}
export function freeExerciseDemonstration(
  exerciseId: string,
  name?: string,
): ExerciseDemonstration {
  const animation = smartWorkoutAnimation(exerciseId, catalogById.get(exerciseId)?.nameEn || name);
  return {
    provider: 'smartworkout',
    media: animation
      ? {
          mp4: animation.mp4,
          gif:
            '/exercise-gifs/' +
            animation.mp4
              .split('/')
              .pop()!
              .replace(/\.mp4$/, '.gif'),
          poster: '/exercise-thumbnails/' + animation.poster.split('/').pop() + '.png',
        }
      : null,
  };
}
