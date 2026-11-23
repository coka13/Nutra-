import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';

const run = promisify(execFile);
const pending = new Map<string, Promise<Buffer>>();
let queue: Promise<unknown> = Promise.resolve();

export async function exerciseGif(source: string): Promise<Buffer> {
  // Accept only the catalog's trusted media host, never an arbitrary URL.
  if (!/^https:\/\/api\.smartworkout\.app\/asset\/video\/[a-f0-9-]+\.mp4$/.test(source))
    throw new Error('Invalid exercise media');
  const bundled = path.join(
    process.cwd(),
    'public',
    'exercise-gifs',
    path.basename(source).replace(/\.mp4$/, '.gif'),
  );
  try {
    return await readFile(bundled);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const key = createHash('sha256')
    .update('gif-v1:' + source)
    .digest('hex');
  const directory = path.join(process.cwd(), '.cache', 'exercise-gifs');
  const file = path.join(directory, key + '.gif');
  try {
    return await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const existing = pending.get(key);
  if (existing) return existing;
  // Serialize conversions so opening several exercises cannot exhaust server CPU.
  const conversion = queue.then(async () => {
    if (!ffmpeg) throw new Error('GIF converter unavailable');
    const { stdout } = await run(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-rw_timeout',
        '15000000',
        '-i',
        source,
        '-t',
        '30',
        '-filter_complex',
        'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer',
        '-threads',
        '1',
        '-filter_complex_threads',
        '1',
        '-loop',
        '0',
        '-f',
        'gif',
        'pipe:1',
      ],
      { encoding: 'buffer', maxBuffer: 24 * 1024 * 1024, timeout: 60000, windowsHide: true },
    );
    await mkdir(directory, { recursive: true });
    const temporary = file + '.' + randomUUID();
    await writeFile(temporary, stdout);
    await rename(temporary, file);
    return stdout;
  });
  queue = conversion.catch(() => {});
  pending.set(key, conversion);
  try {
    return await conversion;
  } finally {
    pending.delete(key);
  }
}
