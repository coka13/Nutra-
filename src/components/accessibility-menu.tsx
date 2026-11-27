'use client';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { usePathname } from 'next/navigation';
import {
  Accessibility,
  ALargeSmall,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  Contrast,
  Palette,
  RotateCcw,
  Type,
  Underline,
  X,
  type LucideIcon,
} from 'lucide-react';
import { translate, type Language } from '@/lib/i18n';
import {
  A11Y_STORAGE_KEY,
  applyA11y,
  defaultA11y,
  readA11y,
  type A11ySettings,
} from '@/lib/accessibility';

type ToggleKey = 'contrast' | 'links' | 'font' | 'motion' | 'grayscale';
const toggles: readonly [ToggleKey, string, LucideIcon][] = [
  ['contrast', 'a11yContrast', Contrast],
  ['links', 'a11yLinks', Underline],
  ['font', 'a11yFont', Type],
  ['motion', 'a11yMotion', CirclePause],
  ['grayscale', 'a11yGrayscale', Palette],
];
/** Ascending; in a right-to-left page the row reads from the right, smallest first. */
const sizes = [0, 1, 2] as const;
const sizePercent = [100, 115, 130];

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
    panel.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
        return;
      }
      // Keep Tab inside the panel while it is open.
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [
        ...panel.current.querySelectorAll<HTMLElement>(
          'button:not([tabindex="-1"]):not(:disabled), a[href]',
        ),
      ];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);
  const t = (key: string) => translate(lang, key);
  if (path?.startsWith('/admin')) return null;
  const update = (patch: Partial<A11ySettings>) => setSettings((s) => ({ ...s, ...patch }));
  const activeCount =
    toggles.filter(([key]) => settings[key]).length + (settings.zoom !== 0 ? 1 : 0);
  // Radio-group keyboard pattern: arrows move and select, following reading direction.
  const onSizeKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const rtl = document.documentElement.dir === 'rtl';
    let next: number | null = null;
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') || e.key === 'ArrowDown')
      next = Math.min(2, settings.zoom + 1);
    if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft') || e.key === 'ArrowUp')
      next = Math.max(0, settings.zoom - 1);
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = 2;
    if (next === null) return;
    e.preventDefault();
    update({ zoom: next as A11ySettings['zoom'] });
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
  const StatementArrow = lang === 'he' ? ChevronLeft : ChevronRight;
  return (
    <div className="a11y-menu">
      <button
        ref={trigger}
        type="button"
        className="a11y-trigger"
        aria-expanded={open}
        aria-controls="a11y-panel"
        aria-label={
          activeCount > 0 ? `${t('a11yMenu')} (${activeCount} ${t('a11yActive')})` : t('a11yMenu')
        }
        onClick={() => setOpen((value) => !value)}
      >
        <Accessibility size={22} aria-hidden="true" />
        {activeCount > 0 && (
          <span className="a11y-trigger-badge" aria-hidden="true">
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <div
          id="a11y-panel"
          ref={panel}
          className="a11y-panel"
          role="dialog"
          aria-labelledby="a11y-title"
        >
          <div className="a11y-panel-head">
            <h2 id="a11y-title">
              <Accessibility size={20} aria-hidden="true" />
              {t('a11yMenu')}
            </h2>
            <button
              type="button"
              className="icon-btn a11y-close"
              aria-label={t('close')}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="a11y-section">
            <span className="a11y-label" id="a11y-size-label">
              <ALargeSmall size={18} aria-hidden="true" />
              {t('a11yTextSize')}
            </span>
            <div
              className="a11y-size"
              role="radiogroup"
              aria-labelledby="a11y-size-label"
              onKeyDown={onSizeKey}
            >
              {sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={settings.zoom === size}
                  tabIndex={settings.zoom === size ? 0 : -1}
                  onClick={() => update({ zoom: size })}
                >
                  <span
                    className="a11y-size-glyph"
                    style={{ fontSize: 13 + size * 3 }}
                    aria-hidden="true"
                  >
                    A
                  </span>
                  {sizePercent[size]}%
                </button>
              ))}
            </div>
          </div>

          <ul className="a11y-switches">
            {toggles.map(([key, label, Icon]) => (
              <li key={key}>
                <button
                  type="button"
                  role="switch"
                  className="a11y-switch"
                  aria-checked={settings[key]}
                  onClick={() => update({ [key]: !settings[key] })}
                >
                  <Icon className="a11y-switch-icon" size={18} aria-hidden="true" />
                  <span className="a11y-switch-label">{t(label)}</span>
                  <span className="a11y-switch-state" aria-hidden="true">
                    {settings[key] ? t('a11yOn') : t('a11yOff')}
                  </span>
                  <span className="a11y-switch-track" aria-hidden="true">
                    <span className="a11y-switch-thumb" />
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="a11y-footer">
            <button
              type="button"
              className="a11y-reset"
              disabled={activeCount === 0}
              onClick={() => setSettings(defaultA11y)}
            >
              <RotateCcw size={16} aria-hidden="true" />
              {t('a11yReset')}
            </button>
            <a href="/accessibility" className="a11y-statement">
              {t('accessibilityStatement')}
              <StatementArrow size={16} aria-hidden="true" />
            </a>
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
