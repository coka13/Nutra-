'use client';
import { useRestAlert } from './workout-rest';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Footprints,
  TrendingUp,
  Trophy,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Dumbbell,
  Globe,
  LayoutDashboard,
  Leaf,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Sun,
  Users,
  Wallet,
  X,
  BookOpen,
  Palette,
  Utensils,
} from 'lucide-react';
import { Language, translate } from '@/lib/i18n';
import { persistLanguage } from '@/lib/language-preference';
import type { Library, State } from '@/lib/types';
import type { CatalogPage } from '@/lib/exercise-catalog';
import { seedCatalogPage, warmCatalogImages } from '@/lib/catalog-client';
import { CoachDashboard } from './coach-dashboard';
import { BrandMark } from './brand-logo';
import { CoachInvitations } from './coach-invitations';
import { Dashboard, ProgressView } from './dashboard';
import { WorkoutsView, BuilderView, LibraryView, ActiveView } from './workouts';
import { NutritionView, RecipesView, MealPlansView } from './nutrition';
import { AdSlot } from './ad-slot';
import { ActivityView } from './activity';
import {
  CalendarView,
  ClientsView,
  MessagesView,
  AssistantView,
  SettingsView,
  BillingView,
  BrandingView,
  AdminView,
} from './studio';
type ContextType = {
  state: State;
  recordCelebrationOpen: boolean;
  clockObservedAt: number;
  library: Library;
  lang: Language;
  t: (key: string) => string;
  date: string;
  setDate: (v: string) => void;
  run: (path: string, body: unknown, quiet?: boolean) => Promise<unknown>;
  refresh: () => Promise<void>;
  navigate: (path: string) => void;
  formatDate: (date: string, options?: Intl.DateTimeFormatOptions) => string;
  number: (n: number) => string;
};
const Context = createContext<ContextType | null>(null);
export function useNutri() {
  const c = useContext(Context);
  if (!c) throw new Error('Nutri context unavailable');
  return c;
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(
      `/api/${path}`,
      body === undefined
        ? { cache: 'no-store' }
        : {
            method: 'POST',
            // Browsers reject keepalive bodies over 64 KB, so uploads opt out.
            keepalive: ![
              'progress/photos',
              'progress/bodyweight',
              'branding/logo',
              'branding/background',
              'ai/photo',
            ].includes(path),
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
    );
  } catch {
    throw new Error('offline');
  }
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'serverError');
  return data;
}
export function localDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA').format(date);
}
export function Workspace({
  initialLanguage,
  initialCatalog,
}: {
  initialLanguage: Language;
  initialCatalog: CatalogPage;
}) {
  useState(() => {
    seedCatalogPage(initialCatalog);
    return true;
  });
  const [state, setState] = useState<State | null>(null),
    [clockObservedAt, setClockObservedAt] = useState(0),
    [library, setLibrary] = useState<Library>({ exercises: [], foods: [] }),
    [lang, setLang] = useState<Language>(initialLanguage),
    [date, setDate] = useState(localDay()),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [record, setRecord] = useState<{
      nameEn: string;
      nameHe: string;
      weight: number;
      reps: number;
    } | null>(null),
    [mobile, setMobile] = useState(false),
    [offline, setOffline] = useState(false),
    [notifications, setNotifications] = useState(false);
  const router = useRouter(),
    pathname = usePathname(),
    requestedPage = pathname.split('/')[2] || 'dashboard',
    page =
      state?.user.role === 'COACH' &&
      ['active', 'activity', 'nutrition', 'recipes', 'progress', 'reports'].includes(requestedPage)
        ? requestedPage === 'nutrition' || requestedPage === 'recipes'
          ? 'mealPlans'
          : requestedPage === 'reports' || requestedPage === 'progress'
            ? 'clients'
            : 'dashboard'
        : requestedPage;
  useEffect(() => {
    warmCatalogImages(initialCatalog);
    router.prefetch('/app/library');
  }, [initialCatalog, router]);
  useEffect(() => {
    document.documentElement.dataset.portalPage = page;
    const visit = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (/^\/app(?:\/[a-zA-Z]+)?$/.test(path)) router.push(path);
    };
    window.addEventListener('nutri-portal-visit', visit);
    return () => window.removeEventListener('nutri-portal-visit', visit);
  }, [page, router]);
  useEffect(() => {
    document.documentElement.dataset.nativeAdsEligible = state?.entitlements.ads ? 'true' : 'false';
    return () => {
      delete document.documentElement.dataset.nativeAdsEligible;
    };
  }, [state?.entitlements.ads]);
  const t = useCallback((k: string) => translate(lang, k), [lang]);
  useRestAlert(
    state?.workouts.find((workout) => workout.status === 'ACTIVE')?.restUntil ?? null,
    lang,
    !!state,
  );
  const refreshVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    const next = await api<State>(`state?date=${date}`).catch((cause: Error) => {
      if (cause.message === 'unauthorized')
        location.replace(document.documentElement.dataset.nativeShell ? '/phone-session' : '/auth');
      throw cause;
    });
    if (version !== refreshVersion.current) return;
    setClockObservedAt(performance.now());
    setState(next);
    setLang(next.user.language === 'he' ? 'he' : 'en');
    setError('');
  }, [date]);
  useEffect(() => {
    Promise.all([refresh(), api<Library>('library').then(setLibrary)]).catch((e) =>
      setError(e.message),
    );
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(
      () => {
        if (!document.hidden) refresh().catch(() => {});
      },
      page === 'calendar' ? 5000 : 20000,
    );
    const sync = () => {
      if (!document.hidden) refresh().catch(() => {});
    };
    window.addEventListener('online', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', sync);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [refresh, page]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    persistLanguage(lang);
  }, [lang]);
  useEffect(() => {
    document.documentElement.dataset.theme = state?.user.theme || 'light';
  }, [state?.user.theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(p: string) {
    router.push(`/app/${p === 'dashboard' ? '' : p}`);
    setMobile(false);
  }
  async function logout() {
    try {
      await api('auth/logout', {});
      location.replace(document.documentElement.dataset.nativeShell ? '/phone-session' : '/auth');
    } catch {}
  }
  async function run(path: string, body: unknown, quiet = false) {
    try {
      const result = await api<{ personalRecord?: boolean }>(path, body);
      if (path !== 'auth/logout') await refresh();
      if (
        path === 'foods' ||
        path === 'recipes' ||
        path === 'exercise-catalog' ||
        path === 'account/reset'
      )
        setLibrary(await api<Library>('library'));
      if (result?.personalRecord) {
        const input = body as { id?: string; set?: { id: string; weight: number; reps: number } };
        const exercise = state?.workouts
          .find((workout) => workout.id === input.id)
          ?.sets.find((set) => set.id === input.set?.id)?.exercise;
        setRecord({
          nameEn: exercise?.nameEn || '',
          nameHe: exercise?.nameHe || '',
          weight: input.set?.weight || 0,
          reps: input.set?.reps || 0,
        });
        navigator.vibrate?.([120, 60, 120]);
        setToast('newRecord');
      } else if (!quiet) setToast('saved');
      return result;
    } catch (e) {
      const key = e instanceof Error ? e.message : 'serverError';
      setToast(key);
      throw e;
    }
  }
  if (!state)
    return (
      <div className="loading-screen">
        <a className="brand" href="/">
          nutra<span>+</span>
        </a>
        {error ? (
          <>
            <p role="alert">{t(error)}</p>
            <button
              className="button primary"
              onClick={() => refresh().catch((e) => setError(e.message))}
            >
              {t('retry')}
            </button>
          </>
        ) : (
          <>
            <Loader2 className="spin" />
            <p>{t('loading')}</p>
          </>
        )}
      </div>
    );
  const isCoach = state.user.role === 'COACH';
  // Coaches see their own brand; clients see the brand of the coach they train with.
  const sidebarBrand = isCoach
    ? { id: state.user.id, name: state.user.name, branding: state.branding }
    : state.relationships.find(
        (link) => link.clientId === state.user.id && link.status === 'ACTIVE',
      )?.coach;
  const nav = isCoach
    ? ([
        ['dashboard', LayoutDashboard],
        ['workouts', Dumbbell],
        ['mealPlans', Utensils],
        ['calendar', CalendarDays],
        ['assistant', Sparkles],
      ] as const)
    : ([
        ['dashboard', LayoutDashboard],
        ['workouts', Dumbbell],
        ['nutrition', Leaf],
        ['activity', Footprints],
        ['progress', TrendingUp],
        ['calendar', CalendarDays],
        ['assistant', Sparkles],
      ] as const);
  const studio = [
    ['clients', Users],
    ['messages', MessageSquare],
    ['branding', Palette],
  ] as const;
  const unread = state.messages.filter((m) => m.recipientId === state.user.id && !m.readAt).length;
  const formatDate = (d: string, options?: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
      timeZone: state.profile?.timezone || 'Asia/Jerusalem',
      ...options,
    }).format(new Date(d));
  const number = (n: number) =>
    new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-US', { maximumFractionDigits: 1 }).format(
      n,
    );
  return (
    <Context.Provider
      value={{
        state,
        recordCelebrationOpen: record !== null,
        clockObservedAt,
        library,
        lang,
        t,
        date,
        setDate,
        run,
        refresh,
        navigate,
        formatDate,
        number,
      }}
    >
      <div className="app-shell">
        <aside className={`sidebar ${mobile ? 'open' : ''}`}>
          <div className="sidebar-brand">
            <a href="/app" className="brand">
              nutra<span>+</span>
              <i />
            </a>
            <button
              className="icon-btn mobile-only"
              onClick={() => setMobile(false)}
              aria-label={t('close')}
            >
              <X />
            </button>
          </div>
          <button className="workspace-switch" onClick={() => navigate('settings')}>
            {sidebarBrand?.branding?.logoAt ? (
              <BrandMark
                coachId={sidebarBrand.id}
                name={sidebarBrand.name}
                branding={sidebarBrand.branding}
                className="workspace-icon"
              />
            ) : (
              <span className="workspace-icon">
                {isCoach ? <Users size={18} /> : <Dumbbell size={18} />}
              </span>
            )}
            <span>
              <strong>
                {t(isCoach ? 'coaching' : sidebarBrand ? 'connectedCoach' : 'personal')}
              </strong>
              <small>
                {sidebarBrand?.branding?.businessName ||
                  (!isCoach && sidebarBrand?.name) ||
                  t('tagline')}
              </small>
            </span>
            <ChevronDown size={14} />
          </button>
          <span className="nav-caption">{t(isCoach ? 'coaching' : 'personal')}</span>
          <nav>
            {nav
              // AI features are hidden entirely on plans that don't include them.
              .filter(([key]) => key !== 'assistant' || state.entitlements.ai)
              .map(([key, Icon]) => (
                <button
                  key={key}
                  className={`nav-item ${page === key ? 'selected' : ''}`}
                  onClick={() => navigate(key)}
                >
                  <Icon size={19} />
                  <span>
                    {t(
                      isCoach && key === 'dashboard'
                        ? 'coachDashboard'
                        : isCoach && key === 'workouts'
                          ? 'workoutPlans'
                          : key,
                    )}
                  </span>
                  {key === 'assistant' && <span className="nav-new">AI</span>}
                </button>
              ))}
          </nav>
          {isCoach ? (
            <>
              <span className="nav-caption">{t('coaching')}</span>
              <nav>
                {studio.map(([key, Icon]) => (
                  <button
                    key={key}
                    className={`nav-item ${page === key ? 'selected' : ''}`}
                    onClick={() => navigate(key)}
                  >
                    <Icon size={19} />
                    <span>{t(key)}</span>
                    {key === 'messages' && unread > 0 && <b className="count">{unread}</b>}
                  </button>
                ))}
              </nav>
            </>
          ) : (
            <nav className="secondary-nav">
              <button
                className={`nav-item ${page === 'library' ? 'selected' : ''}`}
                onClick={() => navigate('library')}
              >
                <BookOpen size={19} />
                {t('library')}
              </button>
              <button className="nav-item" onClick={() => navigate('mealPlans')}>
                <Utensils size={18} />
                {t('myMealPlans')}
              </button>
              <button
                className={`nav-item ${page === 'messages' ? 'selected' : ''}`}
                onClick={() => navigate('messages')}
              >
                <MessageSquare size={19} />
                {t('messages')}
                {unread > 0 && <b className="count">{unread}</b>}
              </button>
            </nav>
          )}
          {state.user.role === 'ADMIN' && (
            <button className="nav-item" onClick={() => navigate('admin')}>
              <Shield size={19} />
              {t('admin')}
            </button>
          )}
          <div className="sidebar-bottom"></div>
          <div className="account-dock">
            <button
              className={`profile-switch ${page === 'settings' ? 'selected' : ''}`}
              onClick={() => navigate('settings')}
              aria-label={t('profileSettings')}
            >
              <span className="avatar">
                {state.user.name
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <span>
                <strong>{state.user.name}</strong>
                <small>{t('profileSettings')}</small>
              </span>
              <Settings2 size={16} />
            </button>
            <button className="nav-item logout-item" onClick={logout}>
              <LogOut size={19} />
              {t('logout')}
            </button>
          </div>
        </aside>
        {mobile && (
          <button
            className="sidebar-scrim"
            aria-label={t('close')}
            onClick={() => setMobile(false)}
          />
        )}
        <div className="main-shell">
          <header className="topbar">
            <div className="row">
              <button
                className="icon-btn mobile-only"
                aria-label={t('menu')}
                onClick={() => setMobile(true)}
              >
                <Menu />
              </button>
              <span className="breadcrumb">
                {t('personal')}
                <span>/</span>
                <strong>{t(page === 'settings' ? 'profileSettings' : page)}</strong>
              </span>
            </div>
            <div className="row top-actions">
              <span className="top-date">
                {formatDate(new Date().toISOString(), {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
              <button
                className="icon-btn"
                aria-label={t('language')}
                onClick={() =>
                  run('preferences', { language: lang === 'en' ? 'he' : 'en' }, true).catch(
                    () => {},
                  )
                }
              >
                <Globe size={17} />
                <span>{lang === 'en' ? 'EN' : 'עב'}</span>
              </button>
              <button
                className="icon-btn"
                aria-label={t('theme')}
                onClick={() =>
                  run(
                    'preferences',
                    { theme: state.user.theme === 'light' ? 'dark' : 'light' },
                    true,
                  ).catch(() => {})
                }
              >
                {state.user.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                className="icon-btn notification-button"
                aria-label={t('notifications')}
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={19} />
                {state.notifications.some((n) => !n.read) && <i />}
              </button>
              <button className="avatar small" onClick={() => navigate('settings')}>
                {state.user.name[0]}
              </button>
            </div>
          </header>
          {notifications && (
            <div className="notification-popover panel">
              <div className="section-heading">
                <h3>{t('notifications')}</h3>
                <button
                  className="icon-btn"
                  onClick={() => setNotifications(false)}
                  aria-label={t('close')}
                >
                  <X size={18} />
                </button>
              </div>
              {state.notifications.length ? (
                state.notifications.map((n) => (
                  <p key={n.id} className={n.read ? 'muted' : ''}>
                    {t(n.key)}
                  </p>
                ))
              ) : (
                <p className="muted">{t('noNotifications')}</p>
              )}
              <button
                className="text-button"
                onClick={() => run('notifications/read', {}, true).catch(() => {})}
              >
                {t('markRead')}
              </button>
            </div>
          )}
          <main className="main-content">
            {state.demo && (
              <div className="demo-label">
                <span className="live-dot" />
                {t('demo')}
              </div>
            )}
            {!state.profile?.onboarded && page !== 'onboarding' && (
              <button className="onboarding-banner" onClick={() => navigate('onboarding')}>
                {t('welcome')}
                <span>{t('getStarted')} →</span>
              </button>
            )}
            {offline && (
              <p className="integration-notice" role="status">
                {t('offlineWorkoutDrafts')}
              </p>
            )}
            {page === 'dashboard' ? (
              <>
                <CoachInvitations />
                {isCoach ? <CoachDashboard /> : <Dashboard />}
              </>
            ) : page === 'workouts' || page === 'templates' ? (
              <WorkoutsView />
            ) : page === 'builder' ? (
              <BuilderView />
            ) : page === 'active' ? (
              <ActiveView />
            ) : page === 'library' ? (
              <LibraryView />
            ) : page === 'activity' ? (
              <ActivityView />
            ) : page === 'nutrition' ? (
              <NutritionView />
            ) : page === 'recipes' ? (
              <RecipesView />
            ) : page === 'mealPlans' ? (
              <MealPlansView />
            ) : page === 'progress' || page === 'reports' ? (
              <ProgressView reports={page === 'reports'} />
            ) : page === 'calendar' ? (
              <CalendarView />
            ) : page === 'clients' ? (
              <ClientsView />
            ) : page === 'messages' ? (
              <MessagesView />
            ) : page === 'assistant' && state.entitlements.ai ? (
              <AssistantView />
            ) : page === 'settings' || page === 'onboarding' ? (
              <SettingsView key={page} onboarding={page === 'onboarding'} />
            ) : page === 'billing' ? (
              <BillingView />
            ) : page === 'branding' ? (
              <BrandingView />
            ) : page === 'admin' ? (
              <AdminView />
            ) : (
              <Empty text={t('notFound')} />
            )}
            {page !== 'active' && <AdSlot />}
            <div className="app-footer">
              <span className="brand-wordmark">
                nutra<span className="green">+</span>
              </span>
              <span>{t('tagline')}</span>
            </div>
          </main>
        </div>
        {record && (
          <Modal
            title={t('newRecord')}
            role="alertdialog"
            className="pr-celebration"
            dismissOnBackdrop={false}
            onClose={() => setRecord(null)}
          >
            <div className="pr-celebration-content">
              <div className="pr-trophy" aria-hidden="true">
                <Trophy size={28} strokeWidth={1.7} />
              </div>
              <p className="pr-exercise">{lang === 'he' ? record.nameHe : record.nameEn}</p>
              <p className="pr-result" dir="ltr">
                {number(record.weight)} {t('kg')} × {number(record.reps)}
              </p>
              <button type="button" className="button primary" onClick={() => setRecord(null)}>
                {t('keepGoing')}
              </button>
            </div>
          </Modal>
        )}
        {toast && (
          <div className={`toast ${toast === 'saved' ? 'success' : ''}`} role="status">
            {toast === 'saved' ? <Check size={18} /> : <Bell size={18} />}
            <span>{t(toast)}</span>
            <button className="icon-btn" aria-label={t('close')} onClick={() => setToast('')}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </Context.Provider>
  );
}
export function PageHeading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="row wrap">{children}</div>
    </div>
  );
}
export function Empty({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <p>{text}</p>
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  role = 'dialog',
  className = '',
  dismissOnBackdrop = true,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  role?: 'dialog' | 'alertdialog';
  className?: string;
  dismissOnBackdrop?: boolean;
}) {
  const { t } = useNutri();
  const panel = useRef<HTMLElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) || [],
      );
    if (!panel.current?.contains(document.activeElement)) focusable()[0]?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') {
        const nodes = focusable(),
          first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', listener);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (dismissOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={panel}
        role={role}
        aria-modal="true"
        aria-label={title}
        className={`modal ${className}`}
      >
        <div className="section-heading">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label={t('close')} onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Submit({ children, busy = false }: { children?: React.ReactNode; busy?: boolean }) {
  const { t } = useNutri();
  return (
    <button type="submit" className="button primary" disabled={busy}>
      {busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />} {children || t('save')}
    </button>
  );
}
export function DatePicker() {
  const { date, setDate, t } = useNutri();
  return (
    <label className="date-picker">
      <CalendarDays size={16} />
      <input
        type="date"
        aria-label={t('date')}
        value={date}
        onChange={(e) => e.target.value && setDate(e.target.value)}
      />
    </label>
  );
}
export function Form({
  onSubmit,
  children,
  className,
}: {
  onSubmit: (data: FormData) => Promise<unknown>;
  children: React.ReactNode;
  className?: string;
}) {
  const { t } = useNutri();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      className={className}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const data = new FormData(e.currentTarget);
        setBusy(true);
        setError('');
        try {
          await onSubmit(data);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'serverError');
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>{children}</fieldset>
      {error && (
        <p role="alert" className="form-error">
          {t(error)}
        </p>
      )}
      {busy && (
        <span className="form-pending">
          <Loader2 size={15} className="spin" />
          {t('saving')}
        </span>
      )}
    </form>
  );
}
