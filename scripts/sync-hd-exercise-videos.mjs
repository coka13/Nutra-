import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sources = [
  {
    id: 'ymove',
    repo: 'ymove-app/exercise-api',
    revision: '81c4c84c66ddbcf96731e74b14c55c267ab04cc3',
  },
  {
    id: 'workout-free-videos',
    repo: 'namnq/workout-free-videos',
    revision: '346c9709eaecfe160a0500650a5f7a43b8425762',
  },
];
const records = [];
async function get(source, file) {
  const response = await fetch(
    `https://raw.githubusercontent.com/${source.repo}/${source.revision}/${file}`,
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
for (const source of sources) {
  const root = path.join('public/exercise-videos', source.id);
  await fs.mkdir(root, { recursive: true });
  if (source.id === 'ymove') {
    const readme = (await get(source, 'free-videos/README.md')).toString();
    await fs.writeFile(path.join(root, 'LICENSE.md'), readme);
    for (const match of readme.matchAll(/\| \[([^\]]+\.mp4)\]\([^)]*\) \| ([^|]+) \|/g)) {
      records.push({
        id: 'ymove-' + match[1].slice(0, -4),
        name: match[2].trim(),
        source: source.id,
        sourceUrl: 'https://ymove.app/free-exercise-videos',
        credit: 'Exercise video by Your Move',
        license: '/exercise-videos/ymove/LICENSE.md',
        path: '/exercise-videos/ymove/' + match[1],
        poster: '/exercise-videos/ymove/' + match[1].replace('.mp4', '.jpg'),
        remotePath: 'free-videos/' + match[1],
      });
    }
  } else {
    await fs.writeFile(path.join(root, 'LICENSE'), await get(source, 'LICENSE'));
    const data = JSON.parse((await get(source, 'data/exercises.json')).toString());
    for (const row of data)
      records.push({
        id: 'wfv-' + row.slug,
        name: row.name,
        source: source.id,
        sourceUrl: 'https://github.com/' + source.repo,
        credit: 'Workout Free Videos · CC0',
        license: '/exercise-videos/workout-free-videos/LICENSE',
        path: '/exercise-videos/workout-free-videos/' + row.slug + '.mp4',
        poster: '/exercise-videos/workout-free-videos/' + row.slug + '.jpg',
        remotePath: row.video.path,
        sha256: row.video.sha256,
      });
  }
}
let cursor = 0;
async function worker() {
  while (cursor < records.length) {
    const row = records[cursor++],
      source = sources.find((source) => source.id === row.source);
    const target = path.join('public', row.path);
    let bytes;
    try {
      bytes = await fs.readFile(target);
    } catch {
      bytes = await get(source, row.remotePath);
    }
    if (row.sha256 && createHash('sha256').update(bytes).digest('hex') !== row.sha256)
      throw new Error('Video checksum mismatch: ' + row.id);
    await fs.writeFile(target, bytes);
    if (row.source === 'ymove')
      await fs.writeFile(
        path.join('public', row.poster),
        await get(source, row.remotePath.replace('.mp4', '.jpg')),
      );
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
await fs.writeFile(
  'src/data/hd-exercise-videos.json',
  JSON.stringify(
    records.map(({ remotePath, ...row }) => row),
    null,
    2,
  ) + '\n',
);
await fs.writeFile(
  'src/data/hd-exercise-videos-source.json',
  JSON.stringify(sources, null, 2) + '\n',
);
console.log(`Bundled ${records.length} free HD videos from pinned sources.`);
