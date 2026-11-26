'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  Bell,
  Bot,
  CreditCard,
  FileText,
  Flag,
  Gauge,
  Languages,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Search,
  ShieldCheck,
  Sun,
  UserCog,
  UserRound,
  Users,
  Dumbbell,
} from 'lucide-react';
import type { AdminLang } from './i18n';
import { AdminApiError, AdminContext, consoleFetch, downloadCsv, Field, makeFormatters, Modal, translator, useAdmin, type Me } from './ui';
import { DashboardSection } from './section-dashboard';
import { CoachesSection, UsersSection } from './section-people';
import { AdsSection, AiSection, BillingSection } from './section-business';
import { ContentSection, NotificationsSection } from './section-content';
import { AccountSection, AdminsSection, AuditSection, ConfigSection, SupportSection, SystemSection } from './section-ops';

type Section = { id: string; label: string; icon: ReactNode; permission?: string; group: string; render: () => ReactNode };

function readPref(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Preferences are optional. */
  }
}

export function AdminConsole({ initialMe }: { initialMe: Me }) {
  const router = useRouter(),
    pathname = usePathname(),
    search = useSearchParams();
  const section = pathname.split('/')[2] || 'dashboard';
  const [me, setMe] = useState(initialMe),
    [lang, setLang] = useState<AdminLang>('en'),
    [theme, setTheme] = useState<'light' | 'dark'>('light'),
    [collapsed, setCollapsed] = useState(false),
    [mobileOpen, setMobileOpen] = useState(false),
    [toasts, setToasts] = useState<{ id: number; text: string; kind: 'ok' | 'error' }[]>([]),
    [dialog, setDialog] = useState<{ title: string; text?: string; danger?: boolean; confirmLabel?: string; resolve: (ok: boolean) => void } | null>(null),
    [stepUp, setStepUp] = useState<{ resolve: (ok: boolean) => void } | null>(null);
  useEffect(() => {
    const storedLang = readPref('nutra_admin_lang');
    setLang(storedLang === 'he' || storedLang === 'en' ? storedLang : document.documentElement.lang === 'he' ? 'he' : 'en');
    const storedTheme = readPref('nutra_admin_theme');
    setTheme(storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setCollapsed(readPref('nutra_admin_sidebar') === 'collapsed');
  }, []);
  const t = useMemo(() => translator(lang), [lang]);
  const toast = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 4200);
  }, []);
  const errorText = useCallback((code: string) => (t('err_' + code) === 'err_' + code ? t('err_serverError') : t('err_' + code)), [t]);
  const fail = useCallback((error: unknown) => toast(errorText(error instanceof Error ? error.message : 'serverError'), 'error'), [toast, errorText]);
  const requestStepUp = useCallback(() => new Promise<boolean>((resolve) => setStepUp({ resolve })), []);
  const api = useCallback(
    async function call<T>(path: string, body?: unknown): Promise<T> {
      try {
        return await consoleFetch<T>(path, body);
      } catch (error) {
        if (error instanceof AdminApiError && error.status === 401 && !path.startsWith('auth/')) {
          location.replace('/admin/login?expired=1');
          throw error;
        }
        if (error instanceof AdminApiError && error.code === 'stepUpRequired') {
          if (await requestStepUp()) return consoleFetch<T>(path, body);
        }
        throw error;
      }
    },
    [requestStepUp],
  );
  const confirm = useCallback(
    (options: { title: string; text?: string; danger?: boolean; confirmLabel?: string }) => new Promise<boolean>((resolve) => setDialog({ ...options, resolve })),
    [],
  );
  const navigate = useCallback(
    (target: string, params?: Record<string, string>) => {
      setMobileOpen(false);
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      router.push(`/admin/${target}${query}`);
    },
    [router],
  );
  const can = useCallback((permission: string) => me.permissions.includes(permission), [me.permissions]);
  const exportCsv = useCallback(
    async (path: string) => {
      try {
        await downloadCsv(path);
      } catch (error) {
        if (error instanceof AdminApiError && error.code === 'stepUpRequired' && (await requestStepUp())) {
          await downloadCsv(path).catch(fail);
          return;
        }
        fail(error);
      }
    },
    [requestStepUp, fail],
  );
  const formatters = useMemo(() => makeFormatters(lang), [lang]);
  // Keep the session indicator current and notice server-side expiry promptly.
  useEffect(() => {
    const timer = setInterval(() => {
      consoleFetch<{ admin: Me }>('auth/me')
        .then((r) => setMe(r.admin))
        .catch((e) => {
          if (e instanceof AdminApiError && e.status === 401) location.replace('/admin/login?expired=1');
        });
    }, 120000);
    return () => clearInterval(timer);
  }, []);

  const sections: Section[] = [
    { id: 'dashboard', label: t('navDashboard'), icon: <Gauge size={18} />, permission: 'dashboard.view', group: 'groupOverview', render: () => <DashboardSection /> },
    { id: 'users', label: t('navUsers'), icon: <Users size={18} />, permission: 'users.view', group: 'groupPeople', render: () => <UsersSection /> },
    { id: 'coaches', label: t('navCoaches'), icon: <Dumbbell size={18} />, permission: 'coaches.view', group: 'groupPeople', render: () => <CoachesSection /> },
    { id: 'support', label: t('navSupport'), icon: <LifeBuoy size={18} />, permission: 'support.view', group: 'groupPeople', render: () => <SupportSection /> },
    { id: 'billing', label: t('navBilling'), icon: <CreditCard size={18} />, permission: 'billing.view', group: 'groupBusiness', render: () => <BillingSection /> },
    { id: 'ads', label: t('navAds'), icon: <Megaphone size={18} />, permission: 'ads.view', group: 'groupBusiness', render: () => <AdsSection /> },
    { id: 'ai', label: t('navAi'), icon: <Bot size={18} />, permission: 'ai.view', group: 'groupProduct', render: () => <AiSection /> },
    { id: 'content', label: t('navContent'), icon: <FileText size={18} />, permission: 'content.view', group: 'groupProduct', render: () => <ContentSection /> },
    { id: 'notifications', label: t('navNotifications'), icon: <Bell size={18} />, permission: 'notifications.view', group: 'groupProduct', render: () => <NotificationsSection /> },
    { id: 'config', label: t('navConfig'), icon: <Flag size={18} />, permission: 'config.view', group: 'groupProduct', render: () => <ConfigSection /> },
    { id: 'system', label: t('navSystem'), icon: <Activity size={18} />, permission: 'system.view', group: 'groupOperations', render: () => <SystemSection /> },
    { id: 'admins', label: t('navAdmins'), icon: <UserCog size={18} />, permission: 'admins.manage', group: 'groupOperations', render: () => <AdminsSection /> },
    { id: 'audit', label: t('navAudit'), icon: <ScrollText size={18} />, permission: 'audit.view', group: 'groupOperations', render: () => <AuditSection /> },
    { id: 'account', label: t('navAccount'), icon: <UserRound size={18} />, group: 'groupOperations', render: () => <AccountSection /> },
  ];
  const visible = sections.filter((s) => !s.permission || can(s.permission));
  const current = sections.find((s) => s.id === section);
  const allowed = current && (!current.permission || can(current.permission));
  const groups = [...new Set(visible.map((s) => s.group))];

  return (
    <AdminContext.Provider value={{ lang, t, me, can, api, toast, fail, confirm, navigate, stepUp: requestStepUp, exportCsv, section, params: search, ...formatters }}>
      <div className="adm" dir={lang === 'he' ? 'rtl' : 'ltr'} lang={lang} data-theme={theme}>
        <div className={`adm-shell ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
          <aside className="adm-sidebar" aria-label={t('menu')}>
            <div className="adm-brand">
              <ShieldCheck size={22} color="var(--a-brand)" />
              <span>
                Fitura<b>+</b>
              </span>
              <small>Admin</small>
            </div>
            <nav>
              {groups.map((group) => (
                <div key={group}>
                  <div className="adm-nav-group">{t(group)}</div>
                  {visible
                    .filter((s) => s.group === group)
                    .map((s) => (
                      <button key={s.id} className={`adm-nav-item ${s.id === section ? 'selected' : ''}`} onClick={() => navigate(s.id)} title={collapsed ? s.label : undefined} aria-current={s.id === section ? 'page' : undefined}>
                        {s.icon}
                        <span className="adm-nav-label">{s.label}</span>
                      </button>
                    ))}
                </div>
              ))}
            </nav>
            <div className="adm-sidebar-foot">
              <button
                className="adm-nav-item adm-collapse-btn"
                onClick={() => {
                  setCollapsed(!collapsed);
                  writePref('nutra_admin_sidebar', collapsed ? 'expanded' : 'collapsed');
                }}
                aria-label={t(collapsed ? 'expand' : 'collapse')}
              >
                {collapsed === (lang === 'he') ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                <span className="adm-nav-label">{t(collapsed ? 'expand' : 'collapse')}</span>
              </button>
              <button
                className="adm-nav-item"
                onClick={async () => {
                  await consoleFetch('auth/logout', {}).catch(() => {});
                  location.replace('/admin/login');
                }}
              >
                <LogOut size={18} />
                <span className="adm-nav-label">{t('signOut')}</span>
              </button>
            </div>
          </aside>
          {mobileOpen && <div className="adm-backdrop" style={{ zIndex: 65 }} onClick={() => setMobileOpen(false)} />}
          <div className="adm-main">
            <header className="adm-topbar">
              <button className="adm-icon-btn adm-menu-btn" onClick={() => setMobileOpen(true)} aria-label={t('menu')}>
                <Menu size={18} />
              </button>
              <GlobalSearch />
              <div className="adm-topbar-actions">
                <span className="adm-session" title={me.email}>
                  {t(me.role)} · {t('sessionEnds')} {me.expiresAt ? new Date(me.expiresAt).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
                <button
                  className="adm-icon-btn"
                  aria-label={t('language')}
                  title={lang === 'he' ? 'English' : 'עברית'}
                  onClick={() => {
                    const next = lang === 'he' ? 'en' : 'he';
                    setLang(next);
                    writePref('nutra_admin_lang', next);
                  }}
                >
                  <Languages size={17} />
                </button>
                <button
                  className="adm-icon-btn"
                  aria-label={t('theme')}
                  onClick={() => {
                    const next = theme === 'dark' ? 'light' : 'dark';
                    setTheme(next);
                    writePref('nutra_admin_theme', next);
                  }}
                >
                  {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                </button>
              </div>
            </header>
            <main className="adm-content" key={section}>
              {allowed ? current.render() : <div className="adm-notice warn">{t('forbidden')}</div>}
            </main>
          </div>
        </div>
        <div className="adm-toasts" role="status" aria-live="polite">
          {toasts.map((toastItem) => (
            <div key={toastItem.id} className={`adm-toast ${toastItem.kind === 'error' ? 'error' : ''}`}>
              {toastItem.text}
            </div>
          ))}
        </div>
        {dialog && (
          <Modal
            title={dialog.title}
            onClose={() => {
              dialog.resolve(false);
              setDialog(null);
            }}
            footer={
              <>
                <button
                  className="adm-btn"
                  onClick={() => {
                    dialog.resolve(false);
                    setDialog(null);
                  }}
                >
                  {t('cancel')}
                </button>
                <button
                  className={`adm-btn ${dialog.danger ? 'danger solid' : 'primary'}`}
                  onClick={() => {
                    dialog.resolve(true);
                    setDialog(null);
                  }}
                >
                  {dialog.confirmLabel ?? t('confirm')}
                </button>
              </>
            }
          >
            {dialog.text && <p style={{ margin: 0 }}>{dialog.text}</p>}
          </Modal>
        )}
        {stepUp && (
          <StepUpDialog
            onDone={(ok, admin) => {
              if (admin) setMe(admin);
              stepUp.resolve(ok);
              setStepUp(null);
            }}
          />
        )}
      </div>
    </AdminContext.Provider>
  );
}

function GlobalSearch() {
  const { t, navigate } = useAdmin();
  const [q, setQ] = useState(''),
    [results, setResults] = useState<{ type: string; id: string; title: string; subtitle: string }[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      consoleFetch<{ results: typeof results }>(`search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setResults(r.results))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setResults(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const open = (r: { type: string; id: string }) => {
    setQ('');
    setResults(null);
    if (r.type === 'ticket') navigate('support', { ticket: r.id });
    else if (r.type === 'content') navigate('content');
    else navigate('users', { user: r.id });
  };
  return (
    <div className="adm-search" ref={box}>
      <Search size={16} />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchEverything')} aria-label={t('search')} />
      {results && (
        <div className="adm-search-results" role="listbox">
          {results.length ? (
            results.map((r) => (
              <button key={r.type + r.id} role="option" aria-selected="false" onClick={() => open(r)}>
                <span className="adm-badge">{t(r.type === 'coach' ? 'COACH' : r.type === 'user' ? 'USER' : r.type === 'ticket' ? 'navSupport' : 'navContent')}</span>
                <span>
                  <div className="adm-cell-main">{r.title}</div>
                  <div className="adm-cell-sub">{r.subtitle}</div>
                </span>
              </button>
            ))
          ) : (
            <div className="adm-empty" style={{ padding: 16 }}>
              {t('noResults')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StepUpDialog({ onDone }: { onDone: (ok: boolean, admin?: Me) => void }) {
  const { t } = useAdmin();
  const errorText = (code: string) => (t('err_' + code) === 'err_' + code ? t('err_serverError') : t('err_' + code));
  const [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title={t('stepUpTitle')} onClose={() => onDone(false)}>
      <form
        className="adm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const r = await consoleFetch<{ admin: Me }>('auth/step-up', { code });
            onDone(true, r.admin);
          } catch (err) {
            setError(errorText(err instanceof Error ? err.message : 'serverError'));
            setBusy(false);
          }
        }}
      >
        <p className="adm-muted" style={{ margin: 0 }}>
          {t('stepUpSub')}
        </p>
        <Field label={t('code')}>
          <input className="adm-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
        </Field>
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-modal-foot">
          <button type="button" className="adm-btn" onClick={() => onDone(false)}>
            {t('cancel')}
          </button>
          <button className="adm-btn primary" disabled={busy || code.length !== 6}>
            {t('verify')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
