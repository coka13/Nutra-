'use client';
import { Sparkles } from 'lucide-react';
import { useNutri } from './workspace';

// Ad placement for plans that include ads (Free). Shows a house ad for Plus until an
// ad network is connected; swap the body here for the network's unit when ready.
export function AdSlot() {
  const { state, t, navigate } = useNutri();
  if (!state.entitlements.ads) return null;
  return (
    <aside className="ad-slot" aria-label={t('adLabel')}>
      <span className="ad-slot-label">{t('adLabel')}</span>
      <Sparkles size={18} aria-hidden="true" />
      <div className="grow">
        <strong>{t('adPlusTitle')}</strong>
        <p>{t('adPlusBody')}</p>
      </div>
      <button className="button secondary" onClick={() => navigate('billing')}>
        {t('adPlusCta')}
      </button>
    </aside>
  );
}
