import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Pass an extracted copy of the pinned source repository; no paid media is used.
const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error('Pass the extracted Flow Exercise Dataset directory. See README.');
const revision = '961bb2739015da373daa43b960c28ee839fe93e6';
const rows = JSON.parse(await fs.readFile(path.join(sourceRoot, 'data/exercises.json'), 'utf8'));
const output = 'public/exercise-animations';
await fs.mkdir(output, { recursive: true });
await fs.mkdir(path.join(output, 'provenance'), { recursive: true });
for (const file of ['LICENSE', 'ARTWORK-LICENSE', 'NOTICE.md'])
  await fs.copyFile(path.join(sourceRoot, file), path.join(output, file));
await fs.copyFile(path.join(sourceRoot, 'data/exercises.json'), 'src/data/animated-exercises.json');
await fs.writeFile(
  'src/data/animated-exercises-source.json',
  JSON.stringify(
    {
      repository: 'https://github.com/ozansozuozgit/flow-exercise-dataset',
      commit: revision,
      dataLicense: 'MIT',
      artworkLicense: 'CC0-1.0',
      count: rows.length,
      animations: rows.filter((row) => row.animation).length,
      notice: '/exercise-animations/NOTICE.md',
    },
    null,
    2,
  ) + '\n',
);
let cursor = 0;
let completed = 0;
async function worker() {
  while (cursor < rows.length) {
    const row = rows[cursor++];
    if (!row.animation) continue;
    if (!/^\d{4}$/.test(row.id)) throw new Error('Invalid exercise ID');
    const { frames, sequence, frameDurationMs, provenance } = row.animation;
    const frameBuffers = [];
    for (const frame of frames) {
      if (!/^assets\/\d{4}\/frame-0[0-2]\.svg$/.test(frame)) throw new Error('Invalid frame path');
      frameBuffers.push(
        await sharp(path.join(sourceRoot, frame))
          .resize(400, 400, { fit: 'contain' })
          .flatten({ background: '#1d2926' })
          .ensureAlpha()
          .raw()
          .toBuffer(),
      );
    }
    await sharp(frameBuffers[0], { raw: { width: 400, height: 400, channels: 4 } })
      .webp()
      .toFile(path.join(output, row.id + '.webp'));
    await sharp(Buffer.concat(sequence.map((index) => frameBuffers[index])), {
      raw: { width: 400, height: 400 * sequence.length, channels: 4, pageHeight: 400 },
    })
      .gif({ delay: sequence.map(() => frameDurationMs), loop: 0 })
      .toFile(path.join(output, row.id + '.gif'));
    if (!/^provenance\/\d{4}\.json$/.test(provenance)) throw new Error('Invalid provenance path');
    await fs.copyFile(path.join(sourceRoot, provenance), path.join(output, provenance));
    completed++;
    if (completed % 200 === 0) console.log(`${completed} animations ready`);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
console.log(`Bundled ${rows.length} records and ${completed} watermark-free GIFs.`);
