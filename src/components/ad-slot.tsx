'use client';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useNutri } from './workspace';

const lastImpression: Record<string, number> = {};
const capKey = () => 'nutra_ad_impressions_' + new Date().toISOString().slice(0, 10);
function impressionsToday() {
  try {
    return Number(localStorage.getItem(capKey()) || 0);
  } catch {
    return 0;
  }
}
function countImpression() {
  try {
    localStorage.setItem(capKey(), String(impressionsToday() + 1));
  } catch {
    /* Storage may be unavailable; the server-side interval still applies. */
  }
}
function track(placement: string, kind: 'impression' | 'click') {
  // Aggregate counters only (per day and placement); failures never affect the page.
  void fetch('/api/ads/event', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placement, kind }),
    keepalive: true,
  }).catch(() => {});
}

// Ad placement for plans that include ads (Free). Shows a house ad for Plus until an
// ad network is connected; swap the body here for the network's unit when ready.
// Administrators can switch placements off and set the refresh interval remotely.
export function AdSlot({
  placement = 'dashboard',
  minIntervalSeconds = 60,
  maxImpressionsPerDay = 0,
}: {
  placement?: string;
  minIntervalSeconds?: number;
  /** 0 = no daily cap. */
  maxImpressionsPerDay?: number;
}) {
  const { state, t, navigate } = useNutri();
  const [capped, setCapped] = useState(false);
  const eligible = state.entitlements.ads && !capped;
  useEffect(() => {
    if (!state.entitlements.ads) return;
    if (maxImpressionsPerDay > 0 && impressionsToday() >= maxImpressionsPerDay) {
      setCapped(true);
      return;
    }
    const now = Date.now();
    if (now - (lastImpression[placement] ?? 0) < minIntervalSeconds * 1000) return;
    lastImpression[placement] = now;
    countImpression();
    track(placement, 'impression');
  }, [state.entitlements.ads, placement, minIntervalSeconds, maxImpressionsPerDay]);
  if (!eligible) return null;
  return (
    <aside className="ad-slot" aria-label={t('adLabel')}>
      <span className="ad-slot-label">{t('adLabel')}</span>
      <Sparkles size={18} aria-hidden="true" />
      <div className="grow">
        <strong>{t('adPlusTitle')}</strong>
        <p>{t('adPlusBody')}</p>
      </div>
      <button
        className="button secondary"
        onClick={() => {
          track(placement, 'click');
          navigate('billing');
        }}
      >
        {t('adPlusCta')}
      </button>
    </aside>
  );
}
