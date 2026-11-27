/**
 * Google AdSense (web). Ownership is verified by a meta tag on every page; the loader (Auto
 * ads) runs only on public pages other than home and sign-in. In-app units are only sent
 * to, and only loaded for, accounts whose plan includes ads, so a paying member never
 * downloads AdSense code. The mobile app uses AdMob instead.
 */
/** Publisher ID; ADSENSE_CLIENT overrides it. */
const defaultClient = 'ca-pub-3933096627211440';
/** Responsive display unit for Free-plan accounts in the app; ADSENSE_SLOT overrides it. */
const defaultSlot = '1235891040';

/** Validated publisher ID (ca-pub-…), or null. */
export function adsenseClient() {
  const client = process.env.ADSENSE_CLIENT?.trim() || defaultClient;
  return /^ca-pub-\d{10,20}$/.test(client) ? client : null;
}

export function adsenseUnit() {
  const client = adsenseClient(),
    slot = process.env.ADSENSE_SLOT?.trim() || defaultSlot;
  if (!client || !slot || !/^\d{6,20}$/.test(slot)) return null;
  return { client, slot };
}

/** ads.txt line authorising Google to sell this site's inventory. */
export function adsTxt() {
  const client = adsenseClient();
  return client ? `google.com, ${client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n` : '';
}
