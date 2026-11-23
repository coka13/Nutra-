import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import animations from '../src/data/smartworkout-exercises.json';
import { exerciseGif } from '../src/lib/exercise-gifs';

test('every indexed video has a ready looping GIF with multiple frames', async () => {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (cursor < animations.length) {
        const row = animations[cursor++];
        const file = path.join(
          process.cwd(),
          'public',
          'exercise-gifs',
          path.basename(row.mp4).replace(/\.mp4$/, '.gif'),
        );
        const metadata = await sharp(file, { animated: true }).metadata();
        assert.equal(metadata.format, 'gif', row.name);
        assert((metadata.pages || 0) > 1, row.name + ' must animate');
        assert.equal(metadata.loop, 0, row.name + ' must loop');
        assert.equal(metadata.width, 320, row.name);
      }
    }),
  );
});

test('animation API reads the bundled GIF without conversion and rejects arbitrary sources', async () => {
  const source = animations[0].mp4;
  const file = path.join(
    process.cwd(),
    'public',
    'exercise-gifs',
    path.basename(source).replace(/\.mp4$/, '.gif'),
  );
  assert.deepEqual(await exerciseGif(source), await readFile(file));
  await assert.rejects(exerciseGif('https://example.test/video.mp4'), /Invalid exercise media/);
});
