import fs from 'node:fs';
import path from 'node:path';
try {
  process.loadEnvFile();
} catch {
  /* Environment may be injected by container. */
}
const url = process.env.DATABASE_URL;
if (url?.startsWith('file:')) {
  const file = path.resolve('prisma', url.slice(5));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.closeSync(fs.openSync(file, 'wx'));
}
