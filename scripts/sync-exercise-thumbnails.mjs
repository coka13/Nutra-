import fs from 'node:fs/promises';
import path from 'node:path';

const rows = JSON.parse(await fs.readFile('src/data/smartworkout-exercises.json', 'utf8'));
const output = 'public/exercise-thumbnails';
await fs.mkdir(output, { recursive: true });
const urls = [...new Set(rows.map((row) => row.poster))];
let cursor = 0;
let completed = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      const match = url.match(/^https:\/\/api\.smartworkout\.app\/asset\/image\/([a-f0-9-]+)$/);
      if (!match) throw new Error('Invalid exercise thumbnail');
      const file = path.join(output, match[1] + '.png');
      try {
        await fs.access(file);
        continue;
      } catch {}
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Thumbnail request failed: ${response.status}`);
      await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
      completed++;
      if (completed % 200 === 0) console.log(`${completed} thumbnails saved`);
    }
  }),
);
console.log(`Ready: ${urls.length} local exercise thumbnails`);
