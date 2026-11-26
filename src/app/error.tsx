'use client';
import { useEffect, useState } from 'react';
import { translate, type Language } from '@/lib/i18n';

export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  const [language, setLanguage] = useState<Language>('en');
  useEffect(() => {
    setLanguage(document.documentElement.lang === 'he' ? 'he' : 'en');
  }, []);
  const t = (key: string) => translate(language, key);
  return (
    <main className="loading-screen" dir={language === 'he' ? 'rtl' : 'ltr'}>
      <a className="brand" href="/app">
        Fitura<span>+</span>
      </a>
      <h1>{t('pageErrorTitle')}</h1>
      <p>{t('pageErrorHint')}</p>
      <button className="button primary" onClick={() => retry()}>
        {t('retry')}
      </button>
      <a className="button secondary" href="/app">
        {t('backHome')}
      </a>
    </main>
  );
}
