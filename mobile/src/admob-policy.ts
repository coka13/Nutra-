/** Only a plan flag crosses the WebView bridge; never send health/account records. */
export function mobileAdPlacement(eligible: boolean, page: string) {
  return eligible && ['dashboard', 'workouts', 'library'].includes(page);
}

export function bannerUnitId(
  mode: string | undefined,
  dev: boolean,
  realId: string | undefined,
  testId: string,
) {
  if (mode === 'off') return null;
  if (dev || !mode || mode === 'test') return testId;
  return mode === 'live' && /^ca-app-pub-\d{16}\/\d{10}$/.test(realId || '') ? realId! : null;
}
