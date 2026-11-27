'use client';
import { useState } from 'react';
import { Check, Loader2, LogOut } from 'lucide-react';
import { Modal, useNutri } from './workspace';

/**
 * Asked once when the Terms/Privacy version on record is older than the current one, or a
 * trainee has not yet given explicit consent to health-data processing (older app versions
 * did not ask at sign-up). The app cannot be used without it; signing out is the alternative.
 */
export function ConsentGate() {
  const { state, t, run } = useNutri();
  const [terms, setTerms] = useState(false);
  const [health, setHealth] = useState(false);
  const [busy, setBusy] = useState(false);
  const consent = state.consent;
  if (!consent || state.demo || (consent.terms && consent.health)) return null;
  const needsHealth = !consent.health;
  const signOut = async () => {
    try {
      await run('auth/logout', {}, true);
    } catch {
      /* Leave anyway. */
    }
    location.replace(document.documentElement.dataset.nativeShell ? '/phone-session' : '/auth');
  };
  const ready = terms && (!needsHealth || health);
  return (
    <Modal
      title={t('consentTitle')}
      onClose={signOut}
      dismissOnBackdrop={false}
      className="consent-gate"
    >
      <form
        className="consent-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready) return;
          setBusy(true);
          try {
            await run('account/consent', { acceptTerms: true, healthConsent: health });
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>{t(consent.terms ? 'consentHealthIntro' : 'consentUpdatedIntro')}</p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            required
          />
          <span>
            {t('termsConsentBefore')}
            <a href="/terms" target="_blank" rel="noopener">
              {t('termsOfUse')}
            </a>
            {t('termsConsentMiddle')}
            <a href="/privacy" target="_blank" rel="noopener">
              {t('privacyPolicy')}
            </a>
            {t('termsConsentAfter')}
          </span>
        </label>
        {needsHealth && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={health}
              onChange={(e) => setHealth(e.target.checked)}
              required
            />
            <span>{t('healthConsentLabel')}</span>
          </label>
        )}
        <p className="muted small-copy">{t('consentWithdraw')}</p>
        <div className="row wrap">
          <button type="submit" className="button primary" disabled={!ready || busy}>
            {busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
            {t('consentAccept')}
          </button>
          <button type="button" className="button secondary" onClick={signOut}>
            <LogOut size={16} />
            {t('logout')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
