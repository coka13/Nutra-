'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Cookie } from 'lucide-react';
import { translate } from '@/lib/i18n';
import { usePageLanguage } from './accessibility-menu';
import {
  COOKIE_CONSENT_EVENT,
  persistCookieChoice,
  readCookieChoice,
  type CookieChoice,
} from '@/lib/cookie-consent';

/** Cookie banner for the website. Hidden in the admin console and inside the mobile app. */
export function CookieConsent() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const lang = usePageLanguage();
  useEffect(() => {
    const native = 'ReactNativeWebView' in window || !!document.documentElement.dataset.nativeShell;
    if (!native && !readCookieChoice()) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(COOKIE_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, reopen);
  }, []);
  if (!open || path?.startsWith('/admin')) return null;
  const t = (key: string) => translate(lang, key);
  const choose = (choice: CookieChoice) => {
    persistCookieChoice(choice);
    setOpen(false);
  };
  return (
    <section className="cookie-banner" role="region" aria-label={t('cookieTitle')}>
      <Cookie size={22} aria-hidden="true" />
      <div className="cookie-banner-text">
        <strong>{t('cookieTitle')}</strong>
        <p>
          {t('cookieBody')} <a href="/privacy">{t('privacyPolicy')}</a>
        </p>
      </div>
      <div className="cookie-banner-actions">
        <button type="button" className="button secondary" onClick={() => choose('necessary')}>
          {t('cookieNecessary')}
        </button>
        <button type="button" className="button primary" onClick={() => choose('all')}>
          {t('cookieAll')}
        </button>
      </div>
    </section>
  );
}
