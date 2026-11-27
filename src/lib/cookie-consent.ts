/**
 * Cookie choice from the banner. Fitura+'s own cookies (session, language) are strictly
 * necessary and are always set. The choice only decides whether Google's ad code may
 * personalize ads on public pages; ads inside the app are never personalized. Where the law
 * requires it (EU/UK), Google's own consent message (AdSense Privacy & messaging) also applies.
 */
export const cookieConsentKey = 'fitura-cookies';
export type CookieChoice = 'all' | 'necessary';
export const COOKIE_CONSENT_EVENT = 'fitura-cookie-settings';

export function parseCookieChoice(value: string | undefined | null): CookieChoice | undefined {
  return value === 'all' || value === 'necessary' ? value : undefined;
}

export function readCookieChoice(): CookieChoice | undefined {
  const match = document.cookie.match(new RegExp('(?:^|; )' + cookieConsentKey + '=([^;]*)'));
  return parseCookieChoice(match?.[1]);
}

/** Stored for 6 months, after which the visitor is asked again. */
export function persistCookieChoice(choice: CookieChoice) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${cookieConsentKey}=${choice}; Path=/; Max-Age=15552000; SameSite=Lax${secure}`;
}

/** Reopens the banner (e.g. from a "Cookie settings" link). */
export function openCookieSettings() {
  window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
}
