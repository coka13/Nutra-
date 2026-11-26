import { networkInterfaces } from 'node:os';
import type { NextRequest } from 'next/server';

export function acceptsOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }
  if (parsedOrigin.protocol !== 'https:' && parsedOrigin.protocol !== 'http:') return false;

  const configuredOrigin = process.env.APP_URL;
  if (configuredOrigin) {
    try {
      const configured = new URL(configuredOrigin);
      if (parsedOrigin.origin === configured.origin) return true;
    } catch {
      // Ignore a malformed deployment value and keep checking the request host.
    }
  }

  // Hostinger and other reverse proxies can pass an internal URL to Next.js. Trust the
  // forwarded host/protocol headers supplied by the hosting proxy to recover the public origin.
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || req.headers.get('host');
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProto || req.nextUrl.protocol.replace(':', '');
  if (host && (protocol === 'http' || protocol === 'https')) {
    try {
      if (parsedOrigin.origin === new URL(`${protocol}://${host}`).origin) return true;
    } catch {
      return false;
    }
  }

  if (process.env.NODE_ENV !== 'development') return false;

  // Next can normalize the server URL to localhost when the phone connects over LAN.
  const directHost = req.headers.get('host');
  if (parsedOrigin.origin !== req.nextUrl.protocol + '//' + directHost) return false;
  return Object.values(networkInterfaces()).some((entries) =>
    entries?.some((entry) => !entry.internal && entry.family === 'IPv4' &&
      entry.address + (req.nextUrl.port ? ':' + req.nextUrl.port : '') === directHost),
  );
}
