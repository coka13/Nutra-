import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { catalogQuery, loadCatalog } from '../src/lib/exercise-catalog';
import {
  freeExercises,
  getFreeExercise,
  freeExerciseDemonstration,
  catalogExercises,
  completeExerciseLibrary,
  localizeCatalogExercise,
  demonstratedExercises,
} from '../src/lib/free-exercises';
import { exerciseGroups } from '../src/lib/exercise-groups';
import { smartWorkoutAnimation, smartWorkoutAnimations } from '../src/lib/smartworkout';

test('default catalog serves the complete bundled data without a key or network', async () => {
  const all = await loadCatalog(catalogQuery.parse({}));
  assert.equal(all.total, demonstratedExercises.length);
  assert(all.total >= 1029);
  assert.equal(all.results.length, 36);
  const next = await loadCatalog(catalogQuery.parse({ offset: 36 }));
  assert.notEqual(next.results[0].id, all.results[0].id);
  const cardio = await loadCatalog(catalogQuery.parse({ category: 'cardio' }));
  assert(cardio.total > 0);
  assert(cardio.results.every((exercise) => exercise.muscle === 'cardio'));
});

test('all exercises are available to the builder and use specific muscle groups', async () => {
  assert.equal(completeExerciseLibrary([]).length, demonstratedExercises.length);
  assert.equal(new Set(catalogExercises.map((row) => row.id)).size, catalogExercises.length);
  assert(catalogExercises.every((row) => exerciseGroups.includes(row.muscle)));
  assert.equal(getFreeExercise('fe_3_4_Sit-Up')?.muscle, 'abdominals');
  for (const muscle of ['biceps', 'triceps', 'quadriceps', 'hamstrings', 'chest', 'abdominals']) {
    const group = await loadCatalog(catalogQuery.parse({ muscle }));
    assert(group.total > 0);
    assert(group.results.every((row) => row.muscle === muscle));
  }
  const preacher = await loadCatalog(
    catalogQuery.parse({ name: 'preacher chair', muscle: 'biceps' }),
  );
  assert(preacher.results.some((row) => row.id === 'fe_Machine_Preacher_Curls'));
  assert(preacher.results.some((row) => row.id === 'fl_0070'));
});

test('demonstrations and thumbnails use only SmartWorkout, including built-in workouts', async () => {
  assert(smartWorkoutAnimations.every((row) => row.mediaTheme === 'light'));
  let matched = 0;
  for (const exercise of catalogExercises) {
    const demo = freeExerciseDemonstration(exercise.id);
    assert.equal(demo.provider, 'smartworkout');
    assert.equal('images' in demo, false);
    assert.equal('animation' in demo, false);
    if (demo.media) {
      matched++;
      assert.match(demo.media.mp4, /^https:\/\/api[.]smartworkout[.]app\/asset\/video\//);
      assert.match(demo.media.poster, /^\/exercise-thumbnails\/[a-f0-9-]+\.png$/);
      assert(existsSync(path.join(process.cwd(), 'public', demo.media.poster)));
      assert.match(demo.media.gif!, /^\/exercise-gifs\/[a-f0-9-]+\.gif$/);
    }
  }
  assert(matched > 200, String(matched));
  for (const id of [
    'squat',
    'pushup',
    'row',
    'rdl',
    'press',
    'bridge',
    'deadbug',
    'lunge',
    'pulldown',
    'chestpress',
    'calf',
    'walk',
    'curl',
    'plank',
    'goblet',
    'legpress',
    'extension',
    'hamcurl',
    'laterals',
    'facepull',
    'stepup',
    'cable',
    'triceps',
  ]) {
    assert(freeExerciseDemonstration(id).media, id);
  }
  assert.equal(smartWorkoutAnimation('rdl')?.name, 'Dumbbell Romanian Deadlift');
  assert.equal(smartWorkoutAnimation('pushup')?.name, 'Incline Push-Up');
  assert.equal(freeExerciseDemonstration('unknown').media, null);
  const page = await loadCatalog(catalogQuery.parse({}));
  assert(
    page.results.every((row) => row.hasVideo && row.thumbnail?.startsWith('/exercise-thumbnails/')),
  );
});

test('every existing free exercise remains available to saved workouts', () => {
  for (const exercise of freeExercises)
    assert.equal(getFreeExercise('fe_' + exercise.id)?.nameEn, exercise.name);
  assert.equal(getFreeExercise('fe_../../secret'), undefined);
});

test('every catalog entry has Hebrew names and instructions, including older saved records', () => {
  for (const exercise of catalogExercises) {
    assert(/[\u0590-\u05ff]/.test(exercise.nameHe), exercise.id + ' name');
    assert(!/[a-z]/i.test(exercise.nameHe), exercise.id + ' untranslated name');
    assert(/[\u0590-\u05ff]/.test(exercise.instructionsHe), exercise.id + ' instructions');
    assert.notEqual(exercise.instructionsHe, exercise.instructionsEn);
  }
  const exercise = getFreeExercise('fe_Machine_Preacher_Curls')!;
  const oldRecord = {
    ...exercise,
    nameHe: exercise.nameEn,
    instructionsHe: exercise.instructionsEn,
  };
  assert.equal(
    completeExerciseLibrary([oldRecord]).find((row) => row.id === exercise.id)?.nameHe,
    'כפיפת מרפקים בכיסא כומר במכונה',
  );
  assert.equal(localizeCatalogExercise(oldRecord).instructionsHe, exercise.instructionsHe);
});

test('animation filter preserves equipment-specific movement matches', async () => {
  const videos = await loadCatalog(catalogQuery.parse({ demonstration: 'video' }));
  assert(videos.total > 200);
  assert(videos.results.every((row) => row.hasVideo));
  const dumbbell = freeExerciseDemonstration('fe_Dumbbell_Bench_Press').media!;
  const barbell = freeExerciseDemonstration('fl_0025').media!;
  assert(dumbbell && barbell);
  assert.notEqual(dumbbell.mp4, barbell.mp4);
  assert.equal(smartWorkoutAnimation('', 'Dumbbell Bench Press')?.name, 'Dumbbell Bench Press');
  assert.equal(smartWorkoutAnimation('', 'Barbell Bench Press')?.name, 'Barbell Bench Press');
  assert.equal(smartWorkoutAnimation('', 'Imaginary Dumbbell Bench Press'), undefined);
});

test('every indexed SmartWorkout animation is reachable from the library and builder', async () => {
  const paths = new Set(
    demonstratedExercises.map((row) => smartWorkoutAnimation(row.id, row.nameEn)!.path),
  );
  assert.equal(paths.size, smartWorkoutAnimations.length);
  for (const row of smartWorkoutAnimations) assert(paths.has(row.path), row.name);
  assert(demonstratedExercises.every((row) => freeExerciseDemonstration(row.id).media));
  const library = completeExerciseLibrary([]);
  assert.equal(library.filter((row) => row.hasDemonstration).length, demonstratedExercises.length);
  const saved = getFreeExercise('fe_3_4_Sit-Up')!;
  assert(!completeExerciseLibrary([saved]).some((row) => row.id === saved.id));
  assert.equal(getFreeExercise(saved.id)?.id, saved.id);
  const reordered = smartWorkoutAnimation('', 'Bench Press Dumbbell');
  assert.equal(reordered?.name, 'Dumbbell Bench Press');
  assert.equal(smartWorkoutAnimation('', 'Smith Bench Press Dumbbell'), undefined);
});

test('saved unsupported exercises are excluded and saved name matches resolve media', () => {
  const base = getFreeExercise('fe_Dumbbell_Bench_Press')!;
  const supported = { ...base, id: 'saved-bench' };
  const unsupported = { ...base, id: 'saved-unsupported', nameEn: 'Imaginary movement' };
  const library = completeExerciseLibrary([supported, unsupported]);
  assert(library.some((row) => row.id === supported.id));
  assert(!library.some((row) => row.id === unsupported.id));
  assert(library.every((row) => row.hasDemonstration));
  assert(freeExerciseDemonstration(supported.id, supported.nameEn).media);
  assert.equal(freeExerciseDemonstration(unsupported.id, unsupported.nameEn).media, null);
});
