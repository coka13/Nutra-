import { NextResponse, type NextRequest } from 'next/server';

/**
 * Host isolation and transport headers. This is a coarse first layer only: every admin API
 * handler re-checks the host, the session and the permission server-side.
 *
 * - With ADMIN_HOST set, the console (/admin, /api/console) exists only on that host, and that
 *   host serves nothing but the console.
 * - In production without ADMIN_HOST the console is disabled unless ADMIN_ALLOW_SHARED_HOST=true.
 * - Admin responses are never indexed or cached; production adds HSTS and HTTPS redirects.
 */
const production = process.env.NODE_ENV === 'production';
const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });

export function proxy(req: NextRequest) {
  const host = (req.headers.get('host') || '').toLowerCase();
  const adminHost = (process.env.ADMIN_HOST || '').toLowerCase().trim();
  const onAdminHost = !!adminHost && (host === adminHost || host.split(':')[0] === adminHost);
  const path = req.nextUrl.pathname;
  const adminPath = path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/console/');

  // TLS terminates at the reverse proxy, which reports the original scheme. Opt-in, because
  // Next fills in x-forwarded-proto=http for direct connections (health checks, local runs).
  const loopback = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  if (
    production &&
    process.env.ENFORCE_HTTPS === 'true' &&
    !loopback &&
    path !== '/api/health' &&
    req.headers.get('x-forwarded-proto') === 'http'
  ) {
    const url = req.nextUrl.clone();
    url.protocol = 'https:';
    url.port = '';
    return NextResponse.redirect(url, 308);
  }

  if (adminHost) {
    if (onAdminHost) {
      if (path === '/robots.txt')
        return new NextResponse('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } });
      if (path === '/') return NextResponse.redirect(new URL(signedIn(req) ? '/admin' : '/admin/login', req.url));
      const asset = path.startsWith('/_next/') || path === '/icon.svg' || path === '/favicon.ico' || path === '/apple-icon.png' || path.startsWith('/exercise-thumbnails/');
      if (!adminPath && !asset) return notFound();
    } else if (adminPath) return notFound();
  } else if (production && adminPath && process.env.ADMIN_ALLOW_SHARED_HOST !== 'true') return notFound();

  // Signed-out visits to the console go straight to the sign-in page, so the server never renders
  // (and dev never compiles) the full console just to redirect. Only a missing cookie short-circuits;
  // a present one is still validated server-side by the page itself.
  const consolePage = path === '/admin' || (path.startsWith('/admin/') && !/^\/admin\/(login|setup)(\/|$)/.test(path));
  if (consolePage && !signedIn(req)) return withHeaders(req, NextResponse.redirect(new URL('/admin/login', req.url)), true);

  return withHeaders(req, NextResponse.next(), adminPath || onAdminHost);
}

/** Mirrors adminCookieName() in lib/admin/auth (not imported: the proxy must stay free of Prisma). */
const signedIn = (req: NextRequest) => req.cookies.has(production ? '__Host-nutra_admin' : 'nutra_admin');

function withHeaders(req: NextRequest, response: NextResponse, admin: boolean) {
  if (production && req.headers.get('x-forwarded-proto') === 'https')
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  if (admin) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline'${production ? '' : " 'unsafe-eval'"}`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "media-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "object-src 'none'",
      ].join('; '),
    );
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|exercise-gifs|exercise-videos|exercise-animations).*)'],
};
