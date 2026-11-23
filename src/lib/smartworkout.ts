import animations from '@/data/smartworkout-exercises.json';
export const smartWorkoutAnimations = animations;
export const smartWorkoutId = (path: string) =>
  'sw_' +
  path
    .split('/')
    .slice(-2)
    .join('-')
    .replace(/[^a-z0-9-]/g, '');
const byId = new Map(animations.map((row) => [smartWorkoutId(row.path), row]));

// Only equivalent names are matched. Never substitute a different apparatus or variation.
const normalize = (name: string) =>
  name
    .toLowerCase()
    .replace(/dumbbells/g, 'dumbbell')
    .replace(/pushups/g, 'pushup')
    .replace(/pullups/g, 'pullup')
    .replace(/\bcurls\b/g, 'curl')
    .replace(/\braises\b/g, 'raise')
    .replace(/\bextensions\b/g, 'extension')
    .replace(/\blunges\b/g, 'lunge')
    .replace(/\brows\b/g, 'row')
    .replace(/[^a-z0-9]/g, '');
const byName = new Map<string, (typeof animations)[number]>();
for (const row of animations) byName.set(normalize(row.name), row);
for (const row of animations)
  for (const name of row.aliases)
    if (!byName.has(normalize(name))) byName.set(normalize(name), row);

// Word order and equivalent spelling do not change the movement. Keep all
// equipment, angle, grip and unilateral qualifiers; ambiguous keys never match.
const movementKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/push[ -]?ups?/g, 'pushup')
    .replace(/pull[ -]?ups?/g, 'pullup')
    .replace(/sit[ -]?ups?/g, 'situp')
    .replace(/dead[ -]lift/g, 'deadlift')
    .replace(/\b(single|one)[ -]arm\b/g, 'unilateralarm')
    .replace(/\b(single|one)[ -]leg\b/g, 'unilateralleg')
    .replace(/\bdumbbells\b/g, 'dumbbell')
    .replace(/\bbiceps\b/g, 'bicep')
    .replace(/\btriceps\b/g, 'tricep')
    .replace(/\blats?\b/g, 'lat')
    .replace(/\b(?:with|the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(
      (word) =>
        ({
          curls: 'curl',
          raises: 'raise',
          extensions: 'extension',
          rows: 'row',
          lunges: 'lunge',
          legs: 'leg',
          arms: 'arm',
          pulls: 'pull',
          presses: 'press',
          squats: 'squat',
          dips: 'dip',
          shrugs: 'shrug',
        })[word] || word,
    )
    .sort()
    .join(' ');
const byMovement = new Map<string, (typeof animations)[number] | null>();
for (const row of animations)
  for (const name of [row.name, ...row.aliases]) {
    const key = movementKey(name);
    if (!byMovement.has(key)) byMovement.set(key, row);
    else if (byMovement.get(key)?.path !== row.path) byMovement.set(key, null);
  }

const aliases: Record<string, string> = {
  'Barbell Bench Press - Medium Grip': 'Barbell Bench Press',
  'Barbell Full Squat': 'Barbell Squat',
  'Side Lateral Raise': 'Dumbbell Lateral Raise',
  'Dumbbell Side Lateral Raise': 'Dumbbell Lateral Raise',
  'Wide-Grip Lat Pulldown': 'Wide Grip Lat Pulldown',
  'Cable Lat Pulldown': 'Wide Grip Lat Pulldown',
  'Seated Cable Rows': 'Seated Cable Row',
  'Cable Seated Row': 'Seated Cable Row',
  'Chest Press Machine': 'Machine Chest Press',
  'Lever Chest Press': 'Machine Chest Press',
  'Leg Extensions': 'Seated Leg Extension Machine',
  'Lever Leg Extension': 'Seated Leg Extension Machine',
  'Triceps Pushdown': 'Cable Triceps Pushdown',
  'Cable Pushdown': 'Cable Triceps Pushdown',
  'Cable Rope Overhead Triceps Extension': 'Overhead Cable Triceps Extension',
  'Face Pull': 'Cable Face Pull',
  'Bent Over Barbell Row': 'Barbell Bent Over Row',
  'Machine Preacher Curls': 'Machine Preacher Curl',
  'Preacher Curl': 'Barbell Preacher Curl',
  'Lying Leg Curls': 'Prone Lying Leg Curl',
};
const builtins: Record<string, string> = {
  squat: 'Squat',
  pushup: 'Incline Push-Up',
  row: 'Dumbbell Bent Over Row',
  rdl: 'Dumbbell Romanian Deadlift',
  press: 'Standing Dumbbell Shoulder Press',
  bridge: 'Glute Bridge',
  deadbug: 'Dead Bug',
  lunge: 'Rear Lunge',
  pulldown: 'Wide Grip Lat Pulldown',
  chestpress: 'Machine Chest Press',
  calf: 'Standing Calf Raise',
  walk: 'Walking Cardio',
  curl: 'Dumbbell Biceps Curl',
  plank: 'Plank',
  goblet: 'Dumbbell Goblet Squat',
  legpress: 'Leg Press',
  extension: 'Seated Leg Extension Machine',
  hamcurl: 'Prone Lying Leg Curl',
  laterals: 'Dumbbell Lateral Raise',
  facepull: 'Cable Face Pull',
  stepup: 'Box step-up',
  cable: 'Seated Cable Row',
  triceps: 'Cable Triceps Pushdown',
};
export function smartWorkoutAnimation(id: string, name?: string) {
  if (byId.has(id)) return byId.get(id);
  const lookup = builtins[id] || (name && (aliases[name] || name));
  return lookup
    ? byName.get(normalize(lookup)) || byMovement.get(movementKey(lookup)) || undefined
    : undefined;
}
