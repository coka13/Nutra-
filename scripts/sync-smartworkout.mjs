import fs from 'node:fs/promises';

const origin = 'https://smartworkout.app';
const categories = [
  'chest',
  'back',
  'shoulders',
  'legs',
  'gluteus',
  'biceps',
  'triceps',
  'forearms',
  'abs',
];
async function page(path) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status}: ${path}`);
  const html = await response.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`Missing exercise data: ${path}`);
  return JSON.parse(match[1]).props.pageProps;
}
const rows = [];
for (const category of categories) {
  const { exercises } = await page('/en/exercise-library/' + category);
  rows.push(...exercises);
}
let cached = [];
try {
  if (!process.argv.includes('--refresh'))
    cached = JSON.parse(await fs.readFile('src/data/smartworkout-exercises.json', 'utf8'));
} catch {}
const byPath = new Map(cached.map((row) => [row.path, row]));
let cursor = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      if (byPath.get(row.path)?.instructions && byPath.get(row.path)?.mediaTheme === 'light')
        continue;
      const { exercise } = await page(row.path);
      const mp4 = exercise.videoLightUrl;
      const poster = exercise.thumbnail1?.uri || exercise.image?.uri;
      if (
        !mp4 ||
        !/^https:\/\/api\.smartworkout\.app\/asset\/video\/[a-f0-9-]+\.mp4$/.test(mp4) ||
        !/^https:\/\/api\.smartworkout\.app\/asset\/image\/[a-f0-9-]+$/.test(poster || '')
      )
        continue;
      byPath.set(row.path, {
        name: row.translations.en,
        aliases: exercise.aliases?.en || [],
        path: row.path,
        equipment: row.equipment,
        tags: row.tags,
        muscles: exercise.muscles || [],
        bodyPart: exercise.bodyPart,
        instructions: exercise.instructions?.en || [],
        mp4,
        poster,
        mediaTheme: 'light',
      });
      if (byPath.size % 100 === 0) {
        await fs.writeFile(
          'src/data/smartworkout-exercises.json',
          JSON.stringify([...byPath.values()], null, 2) + '\n',
        );
        console.log(`${byPath.size} animations indexed`);
      }
    }
  }),
);
await fs.writeFile(
  'src/data/smartworkout-exercises.json',
  JSON.stringify(
    rows.flatMap((row) => (byPath.has(row.path) ? [byPath.get(row.path)] : [])),
    null,
    2,
  ) + '\n',
);
console.log(`Indexed ${byPath.size} SmartWorkout animations (remote media, no copied videos).`);
