/**
 * Google AdSense (web). Off until ADSENSE_CLIENT (ca-pub-…) and ADSENSE_SLOT are set.
 * The unit is only sent to, and only loaded for, accounts whose plan includes ads, so a
 * paying member never downloads AdSense code. The mobile app uses AdMob instead.
 */
export function adsenseUnit() {
  const client = process.env.ADSENSE_CLIENT?.trim(),
    slot = process.env.ADSENSE_SLOT?.trim();
  if (!client || !slot || !/^ca-pub-\d{10,20}$/.test(client) || !/^\d{6,20}$/.test(slot))
    return null;
  return { client, slot };
}

/** ads.txt line authorising Google to sell this site's inventory. */
export function adsTxt() {
  const client = process.env.ADSENSE_CLIENT?.trim();
  return client && /^ca-pub-\d{10,20}$/.test(client)
    ? `google.com, ${client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`
    : '';
}
