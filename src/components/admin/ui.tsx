'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ArrowDownRight, ArrowUpRight, Inbox, Info, Loader2, TriangleAlert, X } from 'lucide-react';
import { adminT, type AdminLang } from './i18n';

export type Me = {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  stepUpUntil?: string | null;
  expiresAt?: string;
  idleTimeoutMs?: number;
};

export class AdminApiError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

/** Raw call to the console API. Every mutation carries the anti-CSRF header. */
export async function consoleFetch<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/console/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'x-nutra-admin': '1' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new AdminApiError(typeof data?.error === 'string' ? data.error : 'serverError', response.status);
  return data as T;
}

type Ctx = {
  lang: AdminLang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  me: Me;
  can: (permission: string) => boolean;
  api: <T>(path: string, body?: unknown) => Promise<T>;
  toast: (text: string, kind?: 'ok' | 'error') => void;
  fail: (error: unknown) => void;
  confirm: (options: { title: string; text?: string; danger?: boolean; confirmLabel?: string }) => Promise<boolean>;
  navigate: (section: string, params?: Record<string, string>) => void;
  /** Asks for the second factor; resolves true when verified. */
  stepUp: () => Promise<boolean>;
  /** Downloads a CSV export, prompting for step-up when the server requires it. */
  exportCsv: (path: string) => Promise<void>;
  section: string;
  params: URLSearchParams;
  formatNumber: (n: number, digits?: number) => string;
  formatMoney: (amount: number, currency?: string) => string;
  formatDate: (value: string | Date | null | undefined, withTime?: boolean) => string;
  formatBytes: (bytes: number) => string;
};
export const AdminContext = createContext<Ctx | null>(null);
export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('AdminContext missing');
  return ctx;
}

export function makeFormatters(lang: AdminLang) {
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  return {
    formatNumber: (n: number, digits = 0) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n),
    formatMoney: (amount: number, currency = 'USD') =>
      new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: amount < 10 ? 2 : 0 }).format(amount),
    formatDate: (value: string | Date | null | undefined, withTime = false) =>
      value
        ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', ...(withTime && { hour: '2-digit', minute: '2-digit' }) }).format(new Date(value))
        : '—',
    formatBytes: (bytes: number) => {
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let i = 0,
        n = bytes;
      while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
      }
      // Left-to-right isolate keeps "8.3 MB" in order inside right-to-left text.
      return `⁦${new Intl.NumberFormat(locale, { maximumFractionDigits: n < 10 && i ? 1 : 0 }).format(n)} ${units[i]}⁩`;
    },
  };
}

export const translator = (lang: AdminLang) => (key: string, vars?: Record<string, string | number>) => {
  let text = adminT(lang, key);
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v));
  return text;
};

/** Loads data for a view and exposes reload; aborts stale responses. */
export function useLoad<T>(path: string | null, deps: unknown[] = []) {
  const { api } = useAdmin();
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const version = useRef(0);
  const reload = useCallback(async () => {
    if (!path) return;
    const v = ++version.current;
    setLoading(true);
    try {
      const result = await api<T>(path);
      if (v === version.current) {
        setData(result);
        setError('');
      }
    } catch (e) {
      if (v === version.current) setError(e instanceof Error ? e.message : 'serverError');
    } finally {
      if (v === version.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

export function PageHead({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="adm-page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="adm-row">{children}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`adm-card ${className}`}>
      {(title || actions) && (
        <div className="adm-card-head">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {actions && <div className="adm-row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Delta({ value, inverse = false }: { value: number | null | undefined; inverse?: boolean }) {
  const { formatNumber, t } = useAdmin();
  if (value == null) return <span className="adm-stat-foot">— {t('vsPrevious')}</span>;
  const good = inverse ? value <= 0 : value >= 0;
  return (
    <span className="adm-stat-foot">
      <span className={`adm-delta ${value === 0 ? '' : good ? 'up' : 'down'}`}>
        {value > 0 ? <ArrowUpRight size={13} /> : value < 0 ? <ArrowDownRight size={13} /> : null}
        {formatNumber(Math.abs(value), 1)}%
      </span>{' '}
      {t('vsPrevious')}
    </span>
  );
}

export function Stat({ label, value, icon, foot, hint }: { label: string; value: ReactNode; icon?: ReactNode; foot?: ReactNode; hint?: string }) {
  return (
    <div className="adm-card adm-stat" title={hint}>
      <span className="adm-stat-label">
        {icon}
        {label}
      </span>
      <span className="adm-stat-value">{value}</span>
      {foot}
    </div>
  );
}

const tone: Record<string, string> = {
  ACTIVE: 'green', APPROVED: 'green', SUCCESS: 'green', PUBLISHED: 'green', SENT: 'green', RESOLVED: 'green', ok: 'green', COACH: 'blue', PREMIUM: 'blue',
  SUSPENDED: 'red', REJECTED: 'red', REVOKED: 'red', FAILURE: 'red', FAILED: 'red', DENIED: 'red', URGENT: 'red', DISABLED: 'red', down: 'red',
  PENDING: 'amber', INVITED: 'amber', SCHEDULED: 'amber', WAITING: 'amber', HIGH: 'amber', DRAFT: 'amber', degraded: 'amber', IN_PROGRESS: 'blue', OPEN: 'blue', SENDING: 'blue',
};
export function Badge({ value, label, kind }: { value?: string; label?: ReactNode; kind?: string }) {
  const { t } = useAdmin();
  return <span className={`adm-badge ${kind ?? tone[value ?? ''] ?? ''}`}>{label ?? t(value ?? '')}</span>;
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="adm-skeleton" style={{ height, width }} aria-hidden="true" />;
}
export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  const { t } = useAdmin();
  return (
    <div className="adm-stack" role="status" aria-label={t('loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={i === 0 ? 22 : 40} width={i === 0 ? '40%' : '100%'} />
      ))}
    </div>
  );
}
export function StatsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="adm-grid stats">
      {Array.from({ length: count }, (_, i) => (
        <div className="adm-card adm-stack" key={i} style={{ gap: 10 }}>
          <Skeleton height={12} width="55%" />
          <Skeleton height={28} width="45%" />
          <Skeleton height={10} width="70%" />
        </div>
      ))}
    </div>
  );
}
export function Empty({ text, icon }: { text?: string; icon?: ReactNode }) {
  const { t } = useAdmin();
  return (
    <div className="adm-empty">
      {icon ?? <Inbox size={28} />}
      <span>{text ?? t('emptyTitle')}</span>
    </div>
  );
}
export function ErrorState({ code, onRetry }: { code: string; onRetry?: () => void }) {
  const { t } = useAdmin();
  return (
    <div className="adm-notice danger" role="alert">
      <TriangleAlert size={18} />
      <div className="adm-spread" style={{ flex: 1 }}>
        <span>{t('err_' + code) === 'err_' + code ? t('err_serverError') : t('err_' + code)}</span>
        {onRetry && (
          <button className="adm-btn small" onClick={onRetry}>
            {t('retry')}
          </button>
        )}
      </div>
    </div>
  );
}
export function Notice({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'warn' | 'danger' }) {
  return (
    <div className={`adm-notice ${kind === 'info' ? '' : kind}`}>
      {kind === 'info' ? <Info size={18} /> : <TriangleAlert size={18} />}
      <div>{children}</div>
    </div>
  );
}

export type Column<T> = { key: string; label: string; render: (row: T) => ReactNode; className?: string };
export function Table<T>({ columns, rows, onRowClick, rowKey }: { columns: Column<T>[]; rows: T[]; onRowClick?: (row: T) => void; rowKey?: (row: T, i: number) => string }) {
  if (!rows.length) return <Empty />;
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.className}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey ? rowKey(row, i) : ((row as { id?: string }).id ?? i)}
              className={onRowClick ? 'clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.className}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const { t, formatNumber } = useAdmin();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="adm-pagination">
      <span>
        {formatNumber(total)} {t('rows')} · {t('page')} {formatNumber(page)} {t('of')} {formatNumber(pages)}
      </span>
      <div className="adm-row">
        <button className="adm-btn small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {t('previous')}
        </button>
        <button className="adm-btn small" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          {t('next')}
        </button>
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide = false }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const { t } = useAdmin();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.adm-modal-close)')?.focus();
    const onKey = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('.adm-modal');
      if (e.key === 'Escape' && dialogs[dialogs.length - 1] === panel.current) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="adm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className={`adm-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="adm-modal-head">
          <h2>{title}</h2>
          <button className="adm-icon-btn adm-modal-close" onClick={onClose} aria-label={t('close')}>
            <X size={16} />
          </button>
        </div>
        {children}
        {footer && <div className="adm-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  const { t } = useAdmin();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.adm-modal')) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="adm-backdrop" style={{ zIndex: 45 }} onMouseDown={onClose} />
      <aside className="adm-drawer" role="dialog" aria-modal="true" aria-label={label}>
        <div className="adm-spread" style={{ marginBottom: 12 }}>
          <span />
          <button className="adm-icon-btn" onClick={onClose} aria-label={t('close')}>
            <X size={16} />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`adm-field ${className}`}>
      {label}
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Switch({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <label className="adm-switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
export function Segment<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="adm-segment" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'selected' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="adm-tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.value} role="tab" aria-selected={tab.value === value} className={tab.value === value ? 'selected' : ''} onClick={() => onChange(tab.value)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export function useDateRange(defaultDays = 30) {
  const [range, setRange] = useState(() => ({ from: isoDay(new Date(Date.now() - (defaultDays - 1) * 86400000)), to: isoDay(new Date()), preset: String(defaultDays) }));
  return [range, setRange] as const;
}
export function DateRange({ value, onChange }: { value: { from: string; to: string; preset: string }; onChange: (v: { from: string; to: string; preset: string }) => void }) {
  const { t } = useAdmin();
  const preset = (days: number) => onChange({ from: isoDay(new Date(Date.now() - (days - 1) * 86400000)), to: isoDay(new Date()), preset: String(days) });
  return (
    <div className="adm-row">
      <Segment
        value={value.preset}
        options={[
          { value: '7', label: t('last7') },
          { value: '30', label: t('last30') },
          { value: '90', label: t('last90') },
          { value: '365', label: t('last365') },
        ]}
        onChange={(v) => preset(Number(v))}
      />
      <input type="date" aria-label={t('from')} value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value, preset: '' })} style={{ width: 150 }} />
      <input type="date" aria-label={t('to')} value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value, preset: '' })} style={{ width: 150 }} />
    </div>
  );
}

export function Busy({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <>
      {busy && <Loader2 size={15} className="adm-spin" />}
      {children}
    </>
  );
}

/** Triggers a download from a console CSV endpoint (step-up handled by the caller). */
export async function downloadCsv(path: string) {
  const response = await fetch(`/api/console/${path}`, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new AdminApiError(typeof data?.error === 'string' ? data.error : 'serverError', response.status);
  }
  const blob = await response.blob();
  const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') || '')?.[1] || 'export.csv';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
