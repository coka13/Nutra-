import fs from 'node:fs/promises';
import path from 'node:path';

const rows = JSON.parse(await fs.readFile('src/data/free-exercises.json', 'utf8'));
const source = JSON.parse(await fs.readFile('src/data/free-exercises-source.json', 'utf8'));
if (!/^[a-f0-9]{40}$/.test(source.commit)) throw new Error('Invalid catalog revision');
const root = path.resolve('public/exercise-catalog');
const images = [...new Set(rows.flatMap((exercise) => exercise.images))];
let cursor = 0;
let completed = 0;
const failures = [];
async function worker() {
  while (cursor < images.length) {
    const image = images[cursor++];
    if (!/^[-A-Za-z0-9_]+\/[0-9]+\.jpg$/.test(image)) throw new Error('Invalid catalog image path');
    const target = path.resolve(root, image);
    if (!target.startsWith(root + path.sep)) throw new Error('Image outside catalog directory');
    try { if ((await fs.stat(target)).size > 0) { completed++; continue; } } catch {}
    let saved = false;
    for (let attempt = 0; attempt < 4 && !saved; attempt++) {
      try {
        const response = await fetch(`https://raw.githubusercontent.com/yuhonas/free-exercise-db/${source.commit}/exercises/${image}`, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Invalid JPEG');
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, bytes);
        saved = true;
      } catch (error) { if (attempt === 3) failures.push({ image, error: error.message }); }
    }
    completed++;
    if (completed % 200 === 0) console.log(`${completed}/${images.length} images ready`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
if (failures.length) { console.error(JSON.stringify(failures)); process.exitCode = 1; }
else console.log(`All ${images.length} demonstration images are bundled locally.`);
