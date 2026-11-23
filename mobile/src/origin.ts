import { isPrivatePreviewOrigin } from '../local-preview';

export function workspaceOrigin(
  configured: string | undefined,
  development: boolean,
  metroHost: string | undefined,
  android: boolean,
  localPreview = false,
): string | null {
  try {
    const devHost = metroHost
      ? new URL('http://' + metroHost).hostname
      : android
        ? '10.0.2.2'
        : 'localhost';
    const url = new URL(configured || (development ? 'http://' + devHost + ':3000' : ''));
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (
      url.protocol !== 'https:' &&
      !(development && url.protocol === 'http:') &&
      !(localPreview && isPrivatePreviewOrigin(url.origin))
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
export function navigationPolicy(
  candidate: string,
  origin: string,
): 'internal' | 'external' | 'block' {
  try {
    const url = new URL(candidate);
    if (url.origin === origin && !url.username && !url.password) return 'internal';
    return ['https:', 'tel:', 'mailto:'].includes(url.protocol) ? 'external' : 'block';
  } catch {
    return 'block';
  }
}
