export function GET() {
  return new Response('<!doctype html><meta charset="utf-8"><title>Fitura+</title>', {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'none'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}
