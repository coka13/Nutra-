'use client';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Dumbbell,
  Users,
  Plus,
  Globe,
  Loader2,
} from 'lucide-react';
import { Language, translate } from '@/lib/i18n';
import { COACH_PACKAGES, PLAN_PRICE_USD } from '@/lib/plans';
import { languagePreferenceKey, parseLanguage, persistLanguage } from '@/lib/language-preference';
import {
  accessibilityContact,
  accessibilityVersion,
  privacyContact,
  privacyVersion,
  termsVersion,
} from '@/lib/legal';
import { openCookieSettings } from '@/lib/cookie-consent';
import { safeNext } from '@/lib/safe-next';
import { APP_STORE_URL, GOOGLE_PLAY_URL, isStorePlaceholder } from '@/lib/app-stores';
const privacySections = [
  'privacyCollect',
  'privacyHealth',
  'privacyUse',
  'privacyCoaches',
  'privacyProviders',
  'privacyAds',
  'privacyCookies',
  'privacyRetention',
  'privacyRights',
  'privacySecurity',
  'privacyAge',
  'privacyChanges',
];
const accessibilitySections = [
  'accessibilityCommitment',
  'accessibilityLevel',
  'accessibilityFeatures',
  'accessibilityLimits',
];
const termsSections = [
  'termsAge',
  'termsAccount',
  'termsHealth',
  'termsCoaches',
  'termsContent',
  'termsBilling',
  'termsPrivacy',
  'termsTermination',
  'termsLiability',
  'termsChanges',
];
export function PublicPageClient({
  mode,
  account,
  initialLanguage,
}: {
  mode: string;
  account?: 'user' | 'coach';
  initialLanguage?: Language;
}) {
  const [lang, setLang] = useState<Language>(initialLanguage ?? 'en'),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(false);
  const [role, setRole] = useState('INDEPENDENT');
  const t = (k: string) => translate(lang, k);
  const title =
    mode === 'verify-email'
      ? t('verifyEmailTitle')
      : account && (mode === 'login' || mode === 'register')
        ? t(account + (mode === 'login' ? 'LoginTitle' : 'RegisterTitle'))
        : t(mode === 'coach-login' ? 'coachLogin' : mode);
  const verificationToken =
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('token');
  // Where to land after signing in (e.g. the billing page from a pricing card).
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    setNext(safeNext(new URLSearchParams(window.location.search).get('next')));
  }, []);
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : '';
  const authUrl = (screen: string) =>
    (account ? `/auth/${account}/${screen}` : `/${screen}`) + nextQuery;
  useEffect(() => {
    if (!initialLanguage) {
      try {
        setLang(parseLanguage(localStorage.getItem(languagePreferenceKey)) ?? 'en');
      } catch {
        // Keep the default when browser storage is unavailable.
      }
    }
    setReady(true);
  }, [initialLanguage]);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    persistLanguage(lang);
  }, [lang, ready]);
  // /pricing (and the retired /features) open the home page at the plans section.
  useEffect(() => {
    if (mode === 'pricing' || mode === 'features')
      document.getElementById('pricing')?.scrollIntoView({ block: 'start' });
  }, [mode]);
  const storeLinks = [
    [APP_STORE_URL, 'appStoreTop', 'App Store', 'apple'],
    [GOOGLE_PLAY_URL, 'googlePlayTop', 'Google Play', 'play'],
  ] as const;
  const plans = [
    {
      key: 'free',
      price: 0,
      points: ['planFree1', 'planFree2', 'planFree3'],
      cta: 'getStarted',
      href: '/auth',
      featured: false,
    },
    {
      key: 'premium',
      price: PLAN_PRICE_USD.PREMIUM,
      points: ['planPremium1', 'planPremium2'],
      cta: 'upgradePlus',
      href: '/auth/user/login?next=/app/billing',
      featured: false,
    },
    {
      key: 'coachTier',
      price: PLAN_PRICE_USD.COACH,
      points: ['planCoach2', 'planCoach5', 'planCoach4'],
      cta: 'upgradeCoach',
      href: '/auth/coach/login?next=/app/billing',
      featured: true,
    },
  ];
  const pricingSection = (
    <section className="pricing-section" id="pricing" aria-labelledby="pricing-title">
      <span className="eyebrow">{t('pricing')}</span>
      <h2 id="pricing-title">{t('pricingTitle')}</h2>
      <p className="pricing-section-sub">{t('pricingSub')}</p>
      <div className="public-plans">
        {plans.map((plan) => (
          <article
            className={`panel public-plan${plan.featured ? ' featured' : ''}`}
            key={plan.key}
          >
            {plan.featured && (
              <span className="public-plan-flag">{t('recommendedForCoaches')}</span>
            )}
            <h3>{t(plan.key)}</h3>
            <p className="public-plan-price">
              {plan.key === 'coachTier' && <small>{t('fromPrice')} </small>}$
              {plan.key === 'coachTier' ? COACH_PACKAGES[0].price : plan.price}
              <small> {t('perMonth')}</small>
            </p>
            <ul className="public-plan-benefits">
              {plan.points.map((point) => (
                <li key={point}>
                  <Check size={16} aria-hidden="true" />
                  {t(point)}
                </li>
              ))}
            </ul>
            {plan.key === 'coachTier' && (
              <div className="coach-package-options">
                <ul className="coach-packages">
                  {COACH_PACKAGES.map((offer) => (
                    <li className="coach-package" key={offer.key}>
                      <span>
                        <strong>{t(offer.key)}</strong>
                        <span className="coach-package-capacity">
                          {t('coachPackageCapacity').replace('{count}', String(offer.clientLimit))}
                        </span>
                      </span>
                      <span className="coach-package-price">${offer.price}</span>
                    </li>
                  ))}
                </ul>
                <p className="coach-package-contact">{t('coachCustomPackage')}</p>
              </div>
            )}
            {/* Plus opens the trainee login, Trainer the trainer login; both continue to billing. */}
            <a
              className={`button ${plan.featured ? 'primary' : 'secondary'} full`}
              href={plan.href}
            >
              {t(plan.cta)}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { acceptTerms, healthConsent, ...values } = Object.fromEntries(
      new FormData(e.currentTarget),
    );
    setBusy(true);
    setError('');
    try {
      const token = new URLSearchParams(location.search).get('token');
      const requestMode =
        mode === 'verify-email' ? (token ? 'verify-email' : 'resend-verification') : mode;
      const r = await fetch(
        `/api/auth/${account && mode !== 'recover' && mode !== 'verify-email' ? account + '/' : ''}${requestMode}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...values,
            language: lang,
            token,
            ...(mode === 'register' && {
              acceptTerms: acceptTerms === 'on',
              healthConsent: healthConsent === 'on',
            }),
          }),
        },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (
        mode === 'recover' ||
        mode === 'reset' ||
        mode === 'verify-email' ||
        (mode === 'register' && data.verificationRequired)
      )
        setSuccess(true);
      else
        location.href =
          next ?? (mode === 'register' && account !== 'coach' ? '/app/onboarding' : '/app');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'offline');
    } finally {
      setBusy(false);
    }
  }
  async function demo() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      location.href = '/app';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'offline');
      setBusy(false);
    }
  }
  const home = ['home', 'features', 'pricing'].includes(mode);
  return (
    <div className={`public-site${home ? ' public-home' : ''}`}>
      <nav className="public-nav">
        <div className="public-nav-main">
          <a href="/" className="brand">
            Fitura<span>+</span>
            <i />
          </a>
        </div>
        <div className="row">
          <button
            className="icon-btn"
            onClick={() => setLang(lang === 'en' ? 'he' : 'en')}
            aria-label={t('language')}
          >
            <Globe size={18} />
            <span>{lang === 'en' ? 'HE' : 'EN'}</span>
          </button>
          {home && (
            <a className="button secondary" href="/auth">
              {t('login')}
            </a>
          )}
        </div>
      </nav>
      {mode === 'choose' ? (
        <main className="account-chooser">
          <img
            className="home-art"
            src="/nutri-home-hero-1000.webp"
            srcSet="/nutri-home-hero-640.webp 640w, /nutri-home-hero-1000.webp 1000w"
            sizes="(max-width: 520px) 320px, 470px"
            alt=""
            width={1000}
            height={1094}
          />
          <div>
            <h1>{t('chooseAccount')}</h1>
            {(['user', 'coach'] as const).map((kind) => (
              <a className="panel account-choice" key={kind} href={`/auth/${kind}/login`}>
                {kind === 'coach' ? <Users size={24} /> : <Dumbbell size={24} />}
                <span>
                  <strong>{t(kind + 'Choice')}</strong>
                  <small>{t(kind + 'ChoiceHint')}</small>
                </span>
                <ArrowUpRight size={19} />
              </a>
            ))}
          </div>
        </main>
      ) : mode === 'terms' || mode === 'privacy' ? (
        <main className="legal-page">
          <h1>{t(mode === 'terms' ? 'termsOfUse' : 'privacyPolicy')}</h1>
          <p className="legal-updated">
            {t('termsUpdated')} {mode === 'terms' ? termsVersion : privacyVersion}
          </p>
          {(mode === 'terms' ? termsSections : privacySections).map((key) => (
            <section key={key}>
              <h2>{t(key + 'Title')}</h2>
              <p>{t(key + 'Body')}</p>
            </section>
          ))}
          {mode === 'privacy' && (
            <section>
              <h2>{t('privacyContactTitle')}</h2>
              <p>
                {t('privacyContactBody')}
                {privacyContact ? (
                  <>
                    {t('privacyContactEmail')}{' '}
                    <a href={`mailto:${privacyContact}`}>{privacyContact}</a>
                  </>
                ) : (
                  '.'
                )}
              </p>
            </section>
          )}
        </main>
      ) : mode === 'accessibility' ? (
        <main className="legal-page">
          <h1>{t('accessibilityStatement')}</h1>
          <p className="legal-updated">
            {t('termsUpdated')} {accessibilityVersion}
          </p>
          {accessibilitySections.map((key) => (
            <section key={key}>
              <h2>{t(key + 'Title')}</h2>
              <p>{t(key + 'Body')}</p>
            </section>
          ))}
          <section>
            <h2>{t('accessibilityContactTitle')}</h2>
            <p>{t('accessibilityContactBody')}</p>
            <ul>
              {accessibilityContact.name && (
                <li>
                  {t('accessibilityCoordinator')} {accessibilityContact.name}
                </li>
              )}
              {accessibilityContact.phone && (
                <li>
                  {t('accessibilityPhone')}{' '}
                  <a href={`tel:${accessibilityContact.phone.replace(/[^\d+]/g, '')}`} dir="ltr">
                    {accessibilityContact.phone}
                  </a>
                </li>
              )}
              {accessibilityContact.email && (
                <li>
                  {t('accessibilityEmail')}{' '}
                  <a href={`mailto:${accessibilityContact.email}`}>{accessibilityContact.email}</a>
                </li>
              )}
              <li>{t('accessibilitySupport')}</li>
            </ul>
          </section>
        </main>
      ) : home ? (
        <main className="landing-overview">
          <section className="landing-hero">
            <div>
              <h1>{t('landingTitle')}</h1>
              <p>{t('landingSub')}</p>
              <div className="hero-actions">
                <div className="row wrap">
                  <a className="button primary large" href="/auth">
                    {t('getStarted')}
                    <ArrowRight size={18} />
                  </a>
                </div>
                {storeLinks.length > 0 && (
                  <div className="store-links">
                    {storeLinks.map(([href, top, name, icon]) => (
                      <a
                        key={name}
                        className="store-link"
                        href={href}
                        aria-label={`${t(top)} ${name}`}
                        onClick={(e) => {
                          // Listings aren't published yet.
                          if (isStorePlaceholder(href)) e.preventDefault();
                        }}
                      >
                        {icon === 'apple' ? (
                          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                            <path
                              fill="currentColor"
                              d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.27-1.6 2.78-.41 6.9 1.15 9.15.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.66zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.75-.96 2.79 1.02.08 2.05-.52 2.68-1.27z"
                            />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                            <path
                              fill="#34a853"
                              d="M3.6 2.2 13.5 12 3.6 21.8c-.36-.2-.6-.6-.6-1.1V3.3c0-.5.24-.9.6-1.1z"
                            />
                            <path
                              fill="#fbbc04"
                              d="m16.8 15.3-3.3-3.3 3.3-3.3 3.7 2.1c1 .6 1 1.8 0 2.4z"
                            />
                            <path
                              fill="#4285f4"
                              d="M13.5 12 3.6 2.2c.3-.17.7-.18 1.1.04l12.1 6.96z"
                            />
                            <path
                              fill="#ea4335"
                              d="m13.5 12 3.3 3.3-12.1 6.96c-.4.22-.8.21-1.1.04z"
                            />
                          </svg>
                        )}
                        <span>
                          <small>{t(top)}</small>
                          <strong>{name}</strong>
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="text-button hero-demo"
                onClick={demo}
                disabled={!ready || busy}
              >
                {busy ? <Loader2 className="spin" size={16} /> : t('tryDemo')}
                {!busy && <ArrowRight size={14} aria-hidden="true" />}
              </button>
              {error && (
                <p className="form-error" role="alert">
                  {t(error)}
                </p>
              )}
            </div>
            <div className="hero-art-frame">
              <img
                className="home-art"
                src="/nutri-home-hero-1000.webp"
                srcSet="/nutri-home-hero-640.webp 640w, /nutri-home-hero-1000.webp 1000w"
                sizes="(max-width: 520px) 320px, 470px"
                width={1000}
                height={1094}
                alt=""
                fetchPriority="high"
              />
            </div>
          </section>
          {pricingSection}
        </main>
      ) : (
        <section className="auth-wrap">
          <div className="auth-story">
            <span className="eyebrow">Fitura+{'‎'} / YOUR NEXT CHAPTER</span>
            <h1>{t('welcome')}</h1>
            <p>{t('landingSub')}</p>
            <div className="decor-rings">
              <Plus size={100} />
            </div>
          </div>
          <div className="auth-card">
            <a className="text-button" href="/">
              ← {t('backHome')}
            </a>
            <h2>{title}</h2>
            {mode === 'reset' && <p>{t('resetLink')}</p>}
            {success ? (
              <div className="success-state">
                <p>
                  {mode === 'recover'
                    ? t('resetSent')
                    : mode === 'register' || mode === 'verify-email'
                      ? mode === 'verify-email' && verificationToken
                        ? t('emailVerified')
                        : t('verificationSent')
                      : t('saved')}
                </p>
                <a className="button primary" href={authUrl('login')}>
                  {t('login')}
                </a>
              </div>
            ) : (
              <form method="post" onSubmit={submit}>
                {mode === 'verify-email' && !verificationToken && (
                  <p className="auth-description">{t('verifyEmailHelp')}</p>
                )}
                {mode === 'register' && (
                  <label>
                    {t('name')}
                    <input name="name" required maxLength={200} autoComplete="name" />
                  </label>
                )}
                {mode !== 'reset' && (mode !== 'verify-email' || !verificationToken) && (
                  <label>
                    {t('email')}
                    <input name="email" type="email" required autoComplete="email" />
                  </label>
                )}
                {mode !== 'recover' && mode !== 'verify-email' && (
                  <label>
                    {t('password')}
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={mode === 'register' || mode === 'reset' ? 10 : 1}
                      maxLength={128}
                      autoComplete={
                        ['login', 'coach-login'].includes(mode)
                          ? 'current-password'
                          : 'new-password'
                      }
                    />
                    {mode === 'register' && <small>{t('passwordHint')}</small>}
                  </label>
                )}
                {mode === 'register' && !account && (
                  <label>
                    {t('role')}
                    <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
                      <option value="INDEPENDENT">{t('independent')}</option>
                      <option value="COACH">{t('coach')}</option>
                    </select>
                  </label>
                )}
                {mode === 'register' && (account === 'coach' || (!account && role === 'COACH')) && (
                  <label>
                    {t('phone')}
                    <input
                      name="phone"
                      type="tel"
                      dir="ltr"
                      autoComplete="tel"
                      required
                      maxLength={40}
                      placeholder="+972501234567"
                    />
                    <small>{t('coachContactHint')}</small>
                  </label>
                )}
                {mode === 'register' && (
                  <label className="checkbox-label terms-consent">
                    <input name="acceptTerms" type="checkbox" required />
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
                )}
                {mode === 'register' && account !== 'coach' && (account || role !== 'COACH') && (
                  <label className="checkbox-label terms-consent">
                    <input name="healthConsent" type="checkbox" required />
                    <span>{t('healthConsentLabel')}</span>
                  </label>
                )}
                {error && (
                  <p className="form-error" role="alert">
                    {t(error)}
                  </p>
                )}
                {mode === 'login' && error === 'emailUnverified' && (
                  <a className="text-button" href="/verify-email">
                    {t('resendVerification')}
                  </a>
                )}
                <button className="button primary full" disabled={!ready || busy}>
                  {busy ? (
                    <Loader2 size={18} className="spin" />
                  ) : (
                    t(
                      mode === 'coach-login'
                        ? 'coachLogin'
                        : mode === 'verify-email'
                          ? verificationToken
                            ? 'verifyEmail'
                            : 'resendVerification'
                          : mode,
                    )
                  )}
                  <ArrowRight size={17} />
                </button>
              </form>
            )}
            {mode === 'login' && !account && (
              <p>
                <a className="text-button" href="/coach-login">
                  {t('coachLogin')}
                </a>
              </p>
            )}
            {mode === 'login' && (
              <div className="auth-bottom">
                <a href={authUrl('recover')}>{t('forgot')}</a>
                <a href={authUrl('register')}>{t('register')}</a>
                {account ? (
                  <a href="/auth">{t('chooseAccount')}</a>
                ) : (
                  <button className="text-button" onClick={demo} disabled={!ready || busy}>
                    {t('tryDemo')}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      )}
      <footer>
        <a className="brand" href="/">
          Fitura<span>+</span>
        </a>
        <span>{t('tagline')}</span>
        <a href="/terms">{t('termsOfUse')}</a>
        <a href="/privacy">{t('privacyPolicy')}</a>
        <a href="/accessibility">{t('accessibilityStatement')}</a>
        <button type="button" className="text-button" onClick={() => openCookieSettings()}>
          {t('cookieSettings')}
        </button>
        <span>© {new Date().getFullYear()} Fitura+{'‎'}</span>
      </footer>
    </div>
  );
}
