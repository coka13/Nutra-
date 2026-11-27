'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Accessibility, RotateCcw, X } from 'lucide-react';
import { translate, type Language } from '@/lib/i18n';
import { openCookieSettings } from '@/lib/cookie-consent';
import {
  A11Y_STORAGE_KEY,
  applyA11y,
  defaultA11y,
  readA11y,
  type A11ySettings,
} from '@/lib/accessibility';

const toggles = [
  ['contrast', 'a11yContrast'],
  ['links', 'a11yLinks'],
  ['font', 'a11yFont'],
  ['motion', 'a11yMotion'],
  ['grayscale', 'a11yGrayscale'],
] as const;

/**
 * Accessibility adjustments for every page (complements, never replaces, accessible markup).
 * Saved per browser; applied before paint by the inline script in the root layout.
 */
export function AccessibilityMenu() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<A11ySettings>(defaultA11y);
  const lang = usePageLanguage();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => setSettings(readA11y()), []);
  useEffect(() => {
    applyA11y(settings);
    try {
      localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* Settings then last for this page view only. */
    }
  }, [settings]);
  // Pause looping exercise videos while "stop animations" is on, including ones added later.
  useEffect(() => {
    if (!settings.motion) return;
    const pause = () =>
      document.querySelectorAll('video').forEach((video) => {
        video.autoplay = false;
        video.pause();
      });
    pause();
    const observer = new MutationObserver(pause);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [settings.motion]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const t = (key: string) => translate(lang, key);
  if (path?.startsWith('/admin')) return null;
  const update = (patch: Partial<A11ySettings>) => setSettings((s) => ({ ...s, ...patch }));
  return (
    <div className="a11y-menu">
      <button
        ref={trigger}
        type="button"
        className="a11y-trigger"
        aria-expanded={open}
        aria-controls="a11y-panel"
        aria-label={t('a11yMenu')}
        onClick={() => setOpen((value) => !value)}
      >
        <Accessibility size={22} aria-hidden="true" />
      </button>
      {open && (
        <div
          id="a11y-panel"
          ref={panel}
          className="a11y-panel"
          role="dialog"
          aria-label={t('a11yMenu')}
        >
          <div className="a11y-panel-head">
            <strong>{t('a11yMenu')}</strong>
            <button
              type="button"
              className="icon-btn"
              aria-label={t('close')}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </div>
          <div className="a11y-size" role="group" aria-label={t('a11yTextSize')}>
            <span>{t('a11yTextSize')}</span>
            {([0, 1, 2] as const).map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={settings.zoom === size}
                aria-label={`${t('a11yTextSize')} ${[100, 115, 130][size]}%`}
                onClick={() => update({ zoom: size })}
                style={{ fontSize: 14 + size * 3 }}
              >
                A
              </button>
            ))}
          </div>
          {toggles.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="a11y-toggle"
              aria-pressed={settings[key]}
              onClick={() => update({ [key]: !settings[key] })}
            >
              {t(label)}
            </button>
          ))}
          <button
            type="button"
            className="a11y-toggle a11y-reset"
            onClick={() => setSettings(defaultA11y)}
          >
            <RotateCcw size={16} aria-hidden="true" /> {t('a11yReset')}
          </button>
          <div className="a11y-links">
            <a href="/accessibility">{t('accessibilityStatement')}</a>
            <button type="button" className="text-button" onClick={() => openCookieSettings()}>
              {t('cookieSettings')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The page language from <html lang>, following in-page language switches. */
export function usePageLanguage(): Language {
  const [lang, setLang] = useState<Language>('en');
  useEffect(() => {
    const read = () => setLang(document.documentElement.lang === 'he' ? 'he' : 'en');
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => observer.disconnect();
  }, []);
  return lang;
}
