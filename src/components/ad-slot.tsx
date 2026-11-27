'use client';
import { useEffect, useRef, useState } from 'react';
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

/** Loads the AdSense library once, and only when an eligible page asks for it. */
function loadAdsense(client: string) {
  // In-app units sit beside health, meal and workout data, so they are never personalized
  // (as with AdMob in the mobile app). Must be set before the library processes any slot.
  const w = window as unknown as { adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number } };
  w.adsbygoogle = w.adsbygoogle || [];
  w.adsbygoogle.requestNonPersonalizedAds = 1;
  if (document.querySelector('script[data-adsense], script[src*="adsbygoogle.js"]')) return;
  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.dataset.adsense = 'true';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.appendChild(script);
}

/** One responsive AdSense unit; mounted only for accounts whose plan shows ads. */
function AdsenseUnit({ client, slot }: { client: string; slot: string }) {
  const ref = useRef<HTMLModElement>(null);
  useEffect(() => {
    loadAdsense(client);
    const el = ref.current;
    // Google marks the slot only once its script runs; mark it now so a repeated effect
    // (React dev mode runs effects twice) never pushes the same slot again.
    if (!el || el.dataset.adsbygoogleStatus || el.dataset.adPushed) return;
    el.dataset.adPushed = '1';
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      /* Blocked or unavailable: the slot simply stays empty. */
    }
  }, [client, slot]);
  return (
    <ins
      ref={ref}
      className="adsbygoogle"
      style={{ display: 'block' }}
      data-ad-client={client}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}

// Ad placement for plans that include ads (Free). Paid plans never render it, and the
// server sends AdSense details only to accounts with ads. Without AdSense (or inside the
// mobile app, which uses AdMob) a house ad for Plus is shown instead.
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
  const [native, setNative] = useState(true);
  useEffect(() => setNative('ReactNativeWebView' in window), []);
  if (!eligible) return null;
  if (state.adsense && !native)
    return (
      <aside className="ad-slot adsense-slot" aria-label={t('adLabel')}>
        <span className="ad-slot-label">{t('adLabel')}</span>
        <AdsenseUnit client={state.adsense.client} slot={state.adsense.slot} />
        <button
          className="text-button muted ad-remove"
          onClick={() => {
            track(placement, 'click');
            navigate('billing');
          }}
        >
          {t('removeAds')}
        </button>
      </aside>
    );
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
