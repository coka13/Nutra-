import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';

const run = promisify(execFile);
const rows = JSON.parse(await fs.readFile('src/data/smartworkout-exercises.json', 'utf8'));
const output = 'public/exercise-gifs';
await fs.mkdir(output, { recursive: true });
const selected = new Set((process.env.GIF_ONLY || '').split(',').filter(Boolean));
const sources = [...new Set(rows.map((row) => row.mp4))].filter(
  (source) => !selected.size || selected.has(path.basename(source, '.mp4')),
);
const limit = Number(process.env.GIF_LIMIT) || sources.length;
let cursor = 0;
let completed = 0;
let bytes = 0;
const started = Date.now();
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (cursor < Math.min(limit, sources.length)) {
      const source = sources[cursor++];
      const match = source.match(
        /^https:\/\/api\.smartworkout\.app\/asset\/video\/([a-f0-9-]+)\.mp4$/,
      );
      if (!match) throw new Error('Invalid exercise video');
      const file = path.join(output, match[1] + '.gif');
      try {
        await fs.access(file);
        completed++;
        continue;
      } catch {}
      for (let attempt = 0; ; attempt++) {
        try {
          await run(
            ffmpeg,
            [
              '-hide_banner',
              '-loglevel',
              'error',
              '-nostdin',
              '-y',
              '-rw_timeout',
              '20000000',
              '-i',
              source,
              '-t',
              '30',
              '-filter_complex',
              'fps=10,scale=320:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer',
              '-threads',
              '1',
              '-filter_complex_threads',
              '1',
              '-loop',
              '0',
              '-f',
              'gif',
              file + '.tmp',
            ],
            { timeout: 90000, windowsHide: true },
          );
          await fs.rename(file + '.tmp', file);
          bytes += (await fs.stat(file)).size;
          completed++;
          if (completed % 50 === 0 || limit < 50)
            console.log(
              `${completed}/${Math.min(limit, sources.length)} GIFs, ${Math.round(bytes / 1048576)} MB, ${Math.round((Date.now() - started) / 1000)}s`,
            );
          break;
        } catch (error) {
          if (attempt >= 2) throw error;
        }
      }
    }
  }),
);
console.log(`Ready: ${completed} prebuilt GIFs`);
