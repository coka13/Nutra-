import { networkInterfaces } from 'node:os';
import type { NextRequest } from 'next/server';

export function acceptsOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin || origin === req.nextUrl.origin || origin === process.env.APP_URL) return true;
  if (process.env.NODE_ENV !== 'development') return false;

  // Next can normalize the server URL to localhost when the phone connects over LAN.
  const host = req.headers.get('host');
  if (origin !== req.nextUrl.protocol + '//' + host) return false;
  return Object.values(networkInterfaces()).some((entries) =>
    entries?.some((entry) => !entry.internal && entry.family === 'IPv4' &&
      entry.address + (req.nextUrl.port ? ':' + req.nextUrl.port : '') === host),
  );
}
