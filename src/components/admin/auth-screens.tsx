'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Languages, Loader2, ShieldCheck } from 'lucide-react';
import type { AdminLang } from './i18n';
import { AdminApiError, consoleFetch, translator } from './ui';

function useAuthChrome() {
  const [lang, setLang] = useState<AdminLang>('en'),
    [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    let stored: string | null = null,
      storedTheme: string | null = null;
    try {
      stored = localStorage.getItem('nutra_admin_lang');
      storedTheme = localStorage.getItem('nutra_admin_theme');
    } catch {
      /* optional */
    }
    setLang(stored === 'he' || stored === 'en' ? stored : document.documentElement.lang === 'he' ? 'he' : 'en');
    setTheme(storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);
  const t = useMemo(() => translator(lang), [lang]);
  const errorText = (e: unknown) => {
    const code = e instanceof AdminApiError ? e.code : 'serverError';
    return t('err_' + code) === 'err_' + code ? t('err_serverError') : t('err_' + code);
  };
  return { lang, setLang, theme, t, errorText };
}

function Shell({ lang, setLang, theme, wide, children }: { lang: AdminLang; setLang: (l: AdminLang) => void; theme: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className="adm" dir={lang === 'he' ? 'rtl' : 'ltr'} lang={lang} data-theme={theme}>
      <main className="adm-auth">
        <div className={`adm-auth-card ${wide ? 'wide' : ''}`}>
          <div className="adm-spread">
            <div className="adm-brand" style={{ padding: 0 }}>
              <ShieldCheck size={22} color="var(--a-brand)" />
              <span>
                Fitura<b>+</b>
              </span>
              <small>Admin</small>
            </div>
            <button
              className="adm-icon-btn"
              aria-label="Language / שפה"
              onClick={() => {
                const next = lang === 'he' ? 'en' : 'he';
                setLang(next);
                try {
                  localStorage.setItem('nutra_admin_lang', next);
                } catch {
                  /* optional */
                }
              }}
            >
              <Languages size={16} />
            </button>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

export function AdminLogin() {
  const { lang, setLang, theme, t, errorText } = useAuthChrome();
  const [step, setStep] = useState<'password' | 'mfa'>('password'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [challenge, setChallenge] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [expired, setExpired] = useState(false);
  useEffect(() => setExpired(new URLSearchParams(location.search).has('expired')), []);
  return (
    <Shell lang={lang} setLang={setLang} theme={theme}>
      {step === 'password' ? (
        <>
          <h1>{t('signIn')}</h1>
          <p>{t('signInSub')}</p>
          {expired && <div className="adm-notice warn">{t('err_unauthorized')}</div>}
          <form
            className="adm-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                const r = await consoleFetch<{ challenge: string }>('auth/login', { email, password });
                setChallenge(r.challenge);
                setPassword('');
                setStep('mfa');
              } catch (err) {
                setError(errorText(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="adm-field">
              {t('email')}
              <input type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </label>
            <label className="adm-field">
              {t('password')}
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p className="adm-error" role="alert">{error}</p>}
            <button className="adm-btn primary" disabled={busy}>
              {busy && <Loader2 size={15} className="adm-spin" />} {t('continue')}
            </button>
          </form>
        </>
      ) : (
        <>
          <h1>{t('mfaTitle')}</h1>
          <p>{t('mfaSub')}</p>
          <form
            className="adm-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                const r = await consoleFetch<{ usedRecovery: boolean }>('auth/mfa', { challenge, code });
                if (r.usedRecovery) alert(t('recoveryUsed'));
                location.replace('/admin');
              } catch (err) {
                if (err instanceof AdminApiError && err.code === 'challengeExpired') {
                  setStep('password');
                  setCode('');
                }
                setError(errorText(err));
                setBusy(false);
              }
            }}
          >
            <label className="adm-field">
              {t('code')}
              <input className="adm-otp" autoComplete="one-time-code" inputMode="text" maxLength={11} required value={code} onChange={(e) => setCode(e.target.value.trim())} autoFocus />
            </label>
            {error && <p className="adm-error" role="alert">{error}</p>}
            <button className="adm-btn primary" disabled={busy || code.length < 6}>
              {busy && <Loader2 size={15} className="adm-spin" />} {t('verify')}
            </button>
            <button type="button" className="adm-btn ghost" onClick={() => { setStep('password'); setCode(''); setError(''); }}>
              {t('back')}
            </button>
          </form>
        </>
      )}
    </Shell>
  );
}

export function AdminSetup({ token }: { token: string }) {
  const { lang, setLang, theme, t, errorText } = useAuthChrome();
  const [info, setInfo] = useState<{ email: string; name: string; role: string; secret: string; qr: string } | null>(null),
    [error, setError] = useState(token ? '' : t('err_inviteInvalid')),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [codes, setCodes] = useState<string[] | null>(null);
  useEffect(() => {
    if (!token) return;
    consoleFetch<NonNullable<typeof info>>(`auth/invite?token=${token}`)
      .then(setInfo)
      .catch((e) => setError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  if (codes)
    return (
      <Shell lang={lang} setLang={setLang} theme={theme} wide>
        <h1>{t('recoveryTitle')}</h1>
        <p>{t('recoveryText')}</p>
        <div className="adm-codes adm-mono">{codes.map((c) => <span key={c}>{c}</span>)}</div>
        <div className="adm-modal-foot">
          <button className="adm-btn" onClick={() => navigator.clipboard.writeText(codes.join('\n'))}>{t('copy')}</button>
          <a className="adm-btn primary" href="/admin/login">{t('savedCodes')}</a>
        </div>
      </Shell>
    );
  return (
    <Shell lang={lang} setLang={setLang} theme={theme} wide>
      <h1>{t('setupTitle')}</h1>
      <p>{t('setupSub')}</p>
      {error && <div className="adm-notice danger">{error}</div>}
      {info && (
        <form
          className="adm-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (password !== confirm) {
              setError(t('passwordsDiffer'));
              return;
            }
            setBusy(true);
            setError('');
            try {
              const r = await consoleFetch<{ recoveryCodes: string[] }>('auth/invite', { token, password, code });
              setCodes(r.recoveryCodes);
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="adm-notice">
            <div>
              <strong>{info.name}</strong> · {info.email} · {t(info.role)}
            </div>
          </div>
          <label className="adm-field">
            {t('password')}
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={14} />
            <small>{t('passwordRule')}</small>
          </label>
          <label className="adm-field">
            {t('confirmPassword')}
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
          <p className="adm-muted" style={{ margin: 0 }}>{t('scanQr')}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="adm-qr" src={info.qr} width={220} height={220} alt="" />
          <code className="adm-mono" style={{ textAlign: 'center', wordBreak: 'break-all' }}>{info.secret}</code>
          <label className="adm-field">
            {t('code')}
            <input className="adm-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
          </label>
          <button className="adm-btn primary" disabled={busy || code.length !== 6}>
            {busy && <Loader2 size={15} className="adm-spin" />} {t('activate')}
          </button>
        </form>
      )}
    </Shell>
  );
}
