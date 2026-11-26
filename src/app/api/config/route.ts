import { NextRequest, NextResponse } from 'next/server';
import { getConfigVersion, publicConfig, versionBelow } from '@/lib/remote-config';
import { translationOverrides } from '@/lib/content-overrides';
export const runtime = 'nodejs';

/**
 * Remote configuration for the web and mobile apps (no authentication; nothing secret).
 * `?appVersion=1.2.3` adds the update decision for that build.
 */
export async function GET(req: NextRequest) {
  const [{ version, config }, translations] = await Promise.all([getConfigVersion(), translationOverrides()]);
  const appVersion = req.nextUrl.searchParams.get('appVersion');
  const update =
    appVersion && /^\d{1,4}(\.\d{1,4}){0,2}$/.test(appVersion)
      ? versionBelow(appVersion, config.app.minimumVersion)
        ? 'required'
        : config.app.updateMode !== 'none' && versionBelow(appVersion, config.app.latestVersion)
          ? config.app.updateMode === 'mandatory'
            ? 'required'
            : 'available'
          : 'none'
      : undefined;
  return NextResponse.json(
    { ...publicConfig(config, version), translations, ...(update && { update }) },
    { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' } },
  );
}
