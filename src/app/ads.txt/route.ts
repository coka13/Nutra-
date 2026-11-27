import { adsTxt } from '@/lib/adsense';

export const dynamic = 'force-dynamic';

export function GET() {
  const body = adsTxt();
  return new Response(body || '# No ad sellers configured.\n', {
    status: body ? 200 : 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
