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
import { PLAN_PRICE_USD } from '@/lib/plans';
import { languagePreferenceKey, parseLanguage, persistLanguage } from '@/lib/language-preference';
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
    account && (mode === 'login' || mode === 'register')
      ? t(account + (mode === 'login' ? 'LoginTitle' : 'RegisterTitle'))
      : t(mode === 'coach-login' ? 'coachLogin' : mode);
  const authUrl = (screen: string) => (account ? `/auth/${account}/${screen}` : `/${screen}`);
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
  const plans = [
    {
      key: 'free',
      price: 0,
      points: ['planFree1', 'planFree2', 'planFree3', 'planAiCoached', 'planFree4'],
      soon: false,
      featured: false,
    },
    {
      key: 'premium',
      price: PLAN_PRICE_USD.PREMIUM,
      points: ['planPremium1', 'planPremium2'],
      soon: true,
      featured: false,
    },
    {
      key: 'coachTier',
      price: PLAN_PRICE_USD.COACH,
      points: ['planCoach1', 'planCoach2', 'planCoach5', 'planCoach3', 'planCoach4', 'planCoach6'],
      soon: true,
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
            <span className="public-plan-icon">
              {plan.key === 'coachTier' ? <Users size={22} /> : <Dumbbell size={22} />}
            </span>
            <h3>{t(plan.key)}</h3>
            <p className="public-plan-price">
              {plan.price ? (
                <>
                  ${plan.price}
                  <small> {t('perMonth')}</small>
                </>
              ) : (
                t('free')
              )}
            </p>
            <ul>
              {plan.points.map((point) => (
                <li key={point}>
                  <Check size={16} aria-hidden="true" />
                  {t(point)}
                </li>
              ))}
            </ul>
            {plan.soon ? (
              <span className="button secondary full" aria-disabled="true">
                {t('comingSoon')}
              </span>
            ) : (
              <a href="/auth" className="button primary full">
                {t('getStarted')}
                <ArrowRight size={17} />
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      const token = new URLSearchParams(location.search).get('token');
      const r = await fetch(
        `/api/auth/${account && mode !== 'recover' ? account + '/' : ''}${mode}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...values, language: lang, token }),
        },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (mode === 'recover' || mode === 'reset') setSuccess(true);
      else location.href = mode === 'register' && account !== 'coach' ? '/app/onboarding' : '/app';
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
    <div className="public-site">
      <nav className="public-nav">
        <a href="/" className="brand">
          nutra<span>+</span>
          <i />
        </a>
        <div className="public-links">
          <a href={home ? '#pricing' : '/pricing'} className="public-pricing-link">
            {t('pricing')}
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
          <a className="button secondary" href={account ? authUrl('login') : '/auth'}>
            {t('login')}
          </a>
          <a className="button primary" href={account ? authUrl('register') : '/auth'}>
            {t('getStarted')}
            <ArrowUpRight size={16} />
          </a>
        </div>
      </nav>
      {mode === 'choose' ? (
        <main className="account-chooser">
          <img className="home-art" src="/nutri-home.webp" alt="" width={1000} height={1094} />
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
      ) : home ? (
        <>
          <section className="landing-hero">
            <div>
              <span className="eyebrow">
                <span className="live-dot" />
                {t('landingBadge')}
              </span>
              <h1>{t('landingTitle')}</h1>
              <p>{t('landingSub')}</p>
              <div className="row wrap">
                <a className="button primary large" href="/auth">
                  {t('getStarted')}
                  <ArrowRight size={18} />
                </a>
                <button className="button secondary large" onClick={demo} disabled={!ready || busy}>
                  {busy ? <Loader2 className="spin" size={18} /> : t('tryDemo')}
                </button>
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {t(error)}
                </p>
              )}
              <div className="hero-foot">
                <span className="mini-mark">
                  <Dumbbell size={17} />
                </span>
                <span>{t('tagline')}</span>
              </div>
            </div>
            <img
              className="home-art"
              src="/nutri-home.webp"
              width={1000}
              height={1094}
              alt=""
              fetchPriority="high"
            />
          </section>
          {pricingSection}
        </>
      ) : (
        <section className="auth-wrap">
          <div className="auth-story">
            <span className="eyebrow">NUTRA+ / YOUR NEXT CHAPTER</span>
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
                <p>{mode === 'recover' ? t('resetSent') : t('saved')}</p>
                <a className="button primary" href={authUrl('login')}>
                  {t('login')}
                </a>
              </div>
            ) : (
              <form method="post" onSubmit={submit}>
                {mode === 'register' && (
                  <label>
                    {t('name')}
                    <input name="name" required maxLength={200} autoComplete="name" />
                  </label>
                )}
                {mode !== 'reset' && (
                  <label>
                    {t('email')}
                    <input name="email" type="email" required autoComplete="email" />
                  </label>
                )}
                {mode !== 'recover' && (
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
                {error && (
                  <p className="form-error" role="alert">
                    {t(error)}
                  </p>
                )}
                <button className="button primary full" disabled={!ready || busy}>
                  {busy ? (
                    <Loader2 size={18} className="spin" />
                  ) : (
                    t(mode === 'coach-login' ? 'coachLogin' : mode)
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
          nutra<span>+</span>
        </a>
        <span>{t('tagline')}</span>
        <span>© {new Date().getFullYear()} Nutra+</span>
      </footer>
    </div>
  );
}
