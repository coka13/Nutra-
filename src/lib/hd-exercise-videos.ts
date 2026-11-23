import videos from '@/data/hd-exercise-videos.json';

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const byId = new Map(videos.map((video) => [video.id, video]));
const byName = new Map<string, (typeof videos)[number]>();
// Professionally filmed Your Move clips take precedence when both libraries cover a movement.
for (const video of videos)
  if (!byName.has(normalize(video.name))) byName.set(normalize(video.name), video);
const aliases: Record<string, string[]> = {
  'ymove-barbell-bench-press-122b71': ['Barbell Bench Press - Medium Grip'],
  'ymove-barbell-back-squat': ['Barbell Full Squat'],
  'ymove-dumbbell-lateral-raise-27a4de': ['Side Lateral Raise', 'Dumbbell Side Lateral Raise'],
  'ymove-hammer-curls': ['Hammer Curls', 'Dumbbell Hammer Curl'],
  'ymove-lat-pulldown': ['Wide-Grip Lat Pulldown', 'Cable Lat Pulldown', 'Lat Pull-Down'],
  'ymove-seated-machine-chest-press': ['Chest Press Machine', 'Lever Chest Press'],
  'ymove-seated-cable-row-close-v-bar-bccf4f': ['Seated Cable Rows', 'Cable Seated Row'],
  'ymove-cable-rope-face-pull': ['Face Pull', 'Cable Face Pull'],
  'ymove-leg-extension': ['Leg Extensions', 'Lever Leg Extension'],
  'ymove-leg-press': ['Sled 45 Degrees Leg Press'],
  'ymove-cable-tricep-pushdown': ['Triceps Pushdown', 'Cable Pushdown'],
  'ymove-overhead-cable-rope-extension': ['Cable Rope Overhead Triceps Extension'],
  'ymove-goblet-squat-with-kettlebell': ['Kettlebell Goblet Squat'],
  'wfv-dumbbell-hammer-preacher-curl': [
    'Preacher Hammer Dumbbell Curl',
    'Dumbbell Hammer Preacher Curl',
  ],
  'wfv-standing-barbell-curl': ['Barbell Curl'],
  'wfv-incline-dumbbell-curl': ['Incline Dumbbell Curl', 'Dumbbell Incline Biceps Curl'],
  'wfv-exercise-ball-dumbbell-bench-press': ['Dumbbell Bench Press with Exercise Ball'],
  'wfv-chest-dip': ['Dips - Chest Version'],
  'wfv-close-grip-bench-press': ['Close-Grip Barbell Bench Press'],
  'wfv-barbell-shrug': ['Barbell Shrug'],
  'wfv-dumbbell-shrug': ['Dumbbell Shrug'],
  'wfv-barbell-upright-row': ['Upright Barbell Row'],
  'wfv-bent-over-row': ['Bent Over Barbell Row'],
  'wfv-wide-grip-pull-up': ['Wide-Grip Pull-Up'],
  'wfv-straight-arm-lat-pull-down': ['Straight-Arm Pulldown', 'Cable Straight Arm Pulldown'],
  'wfv-barbell-hip-thrust': ['Barbell Hip Thrust'],
  'wfv-good-mornings': ['Good Morning'],
  'wfv-machine-hack-squat': ['Hack Squat', 'Sled Hack Squat'],
  'wfv-seated-leg-curl': ['Seated Leg Curl', 'Lever Seated Leg Curl'],
  'wfv-exercise-ball-leg-curl': ['Ball Leg Curl'],
  'wfv-seated-calf-raise': ['Seated Calf Raise', 'Lever Seated Calf Raise'],
  'wfv-hip-adduction-machine': ['Thigh Adductor', 'Lever Seated Hip Adduction'],
  'wfv-cable-hip-abduction': ['Cable Hip Abduction'],
};
for (const [id, names] of Object.entries(aliases)) {
  const video = byId.get(id);
  if (video)
    for (const name of names) if (!byName.has(normalize(name))) byName.set(normalize(name), video);
}
const builtin: Record<string, string> = {
  pulldown: 'ymove-lat-pulldown',
  chestpress: 'ymove-seated-machine-chest-press',
  goblet: 'ymove-dumbbell-goblet-squat-202e4f',
  legpress: 'ymove-leg-press',
  extension: 'ymove-leg-extension',
  laterals: 'ymove-dumbbell-lateral-raise-27a4de',
  facepull: 'ymove-cable-rope-face-pull',
  cable: 'ymove-seated-cable-row-close-v-bar-bccf4f',
  triceps: 'ymove-cable-tricep-pushdown',
};
export function hdExerciseVideo(id: string, name?: string) {
  return byId.get(builtin[id]) || (name ? byName.get(normalize(name)) : undefined);
}
