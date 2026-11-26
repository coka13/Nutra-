'use client';
import { useEffect, useState } from 'react';
import { BadgeCheck, Download, KeyRound, LogOut, ShieldOff, Trash2, UserCheck } from 'lucide-react';
import {
  Badge,
  Card,
  Drawer,
  Empty,
  ErrorState,
  Field,
  LoadingBlock,
  Modal,
  Notice,
  PageHead,
  Pagination,
  Switch,
  Table,
  useAdmin,
  useLoad,
} from './ui';

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  coachStatus: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  plan: string;
  cancelPending: boolean;
  minor: boolean;
  coached: boolean;
  clients: number;
};
type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

function useQueryState(initial: Record<string, string>) {
  const [query, setQuery] = useState(initial);
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '')).toString();
  return [query, (patch: Record<string, string>) => setQuery((q) => ({ ...q, page: '1', ...patch })), qs] as const;
}

export function UsersSection() {
  const { t, formatDate, params, can, exportCsv } = useAdmin();
  const [query, update, qs] = useQueryState({ q: '', role: '', status: '', plan: '', coaching: '', sort: '', page: '1' });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(params.get('user'));
  useEffect(() => {
    const timer = setTimeout(() => update({ q: search }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const { data, error, loading, reload } = useLoad<Paged<UserRow>>(`users?${qs}`, [qs]);
  return (
    <>
      <PageHead title={t('navUsers')} subtitle={t('usersSub')}>
        {can('users.export') && (
          <button
            className="adm-btn"
            onClick={() =>
              exportCsv(`users/export?${qs.replace(/(^|&)page=\d+/, '')}`)
            }
          >
            <Download size={15} /> {t('export')}
          </button>
        )}
      </PageHead>
      <div className="adm-toolbar">
        <input type="search" placeholder={t('search')} aria-label={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label={t('filterRole')} value={query.role} onChange={(e) => update({ role: e.target.value })}>
          <option value="">{t('filterRole')}: {t('all')}</option>
          <option value="INDEPENDENT">{t('INDEPENDENT')}</option>
          <option value="COACH">{t('COACH')}</option>
        </select>
        <select aria-label={t('filterStatus')} value={query.status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">{t('filterStatus')}: {t('all')}</option>
          <option value="ACTIVE">{t('ACTIVE')}</option>
          <option value="SUSPENDED">{t('SUSPENDED')}</option>
        </select>
        <select aria-label={t('filterPlan')} value={query.plan} onChange={(e) => update({ plan: e.target.value })}>
          <option value="">{t('filterPlan')}: {t('all')}</option>
          {['FREE', 'PREMIUM', 'COACH', 'GRANT'].map((p) => (
            <option key={p} value={p}>
              {t(p)}
            </option>
          ))}
        </select>
        <select aria-label={t('filterCoaching')} value={query.coaching} onChange={(e) => update({ coaching: e.target.value })}>
          <option value="">{t('filterCoaching')}: {t('all')}</option>
          <option value="coached">{t('coached')}</option>
          <option value="independent">{t('independent')}</option>
        </select>
        <select aria-label={t('actions')} value={query.sort} onChange={(e) => update({ sort: e.target.value })}>
          <option value="">{t('sortNewest')}</option>
          <option value="oldest">{t('sortOldest')}</option>
          <option value="name">{t('sortName')}</option>
          <option value="lastActive">{t('sortActive')}</option>
        </select>
      </div>
      {error && <ErrorState code={error} onRetry={() => void reload()} />}
      {!data ? (
        <LoadingBlock rows={8} />
      ) : (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <Table
            rows={data.items}
            onRowClick={(row) => setSelected(row.id)}
            columns={[
              { key: 'name', label: t('name'), render: (u) => (<><div className="adm-cell-main">{u.name} {u.minor && <Badge kind="amber" label={t('minor')} />}</div><div className="adm-cell-sub">{u.email}</div></>) },
              { key: 'role', label: t('role'), render: (u) => (<div className="adm-row"><Badge value={u.role} kind={u.role === 'COACH' ? 'blue' : ''} />{u.coachStatus && u.coachStatus !== 'APPROVED' && <Badge value={u.coachStatus} />}{u.coached && <Badge kind="" label={t('coached')} />}</div>) },
              { key: 'status', label: t('status'), render: (u) => <Badge value={u.status} /> },
              { key: 'plan', label: t('plan'), render: (u) => (<>{t(u.plan)}{u.cancelPending && <div className="adm-cell-sub">{t('pendingCancellations')}</div>}</>) },
              { key: 'created', label: t('created'), render: (u) => formatDate(u.createdAt) },
              { key: 'active', label: t('lastActive'), render: (u) => (u.lastActiveAt ? formatDate(u.lastActiveAt, true) : t('never')) },
            ]}
          />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => update({ page: String(page) })} />
        </div>
      )}
      {selected && <UserDrawer id={selected} onClose={() => setSelected(null)} onChanged={() => void reload()} />}
    </>
  );
}

type UserDetail = {
  user: { id: string; name: string; email: string; phone: string | null; role: string; status: string; suspendedAt: string | null; coachStatus: string; coachVerifiedAt: string | null; coachCredentials: string; coachClientLimit: number | null; language: string; createdAt: string; lastActiveAt: string | null; minor: boolean; onboarded: boolean; aiConsent: boolean };
  subscription: { tier: string; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; canceledAt: string | null; provider: string | null } | null;
  entitlements: { plan: string; ai: boolean; ads: boolean; clientLimit: number };
  grants: { id: string; kind: string; source: string; reason: string; startsAt: string; endsAt: string | null; revokedAt: string | null; createdAt: string }[];
  coaches: { id: string; status: string; since: string; coach: { id: string; name: string; email: string } }[];
  clients: { id: string; status: string; since: string; client: { id: string; name: string } }[];
  activity: { activeDays30: number; workouts30: number; mealEntries30: number; activeSessions: number };
  events: { action: string; createdAt: string }[];
  tickets: { id: string; subject: string; status: string; category: string; createdAt: string }[];
  reports: { id: string; subject: string; status: string; category: string; createdAt: string }[];
  payments: { id: string; amount: number; currency: string; status: string; createdAt: string }[] | null;
  emailConfigured: boolean;
};

function UserDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, api, toast, fail, confirm, can, formatDate, formatMoney, navigate, formatNumber } = useAdmin();
  const { data, error, reload } = useLoad<UserDetail>(`users/${id}`, [id]);
  const [busy, setBusy] = useState(false),
    [grantOpen, setGrantOpen] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false);
  async function act(path: string, body: unknown, message = t('saved')) {
    setBusy(true);
    try {
      await api(path, body);
      toast(message);
      await reload();
      onChanged();
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const u = data?.user;
  return (
    <Drawer onClose={onClose} label={u?.name ?? t('details')}>
      {error && <ErrorState code={error} onRetry={() => void reload()} />}
      {!data || !u ? (
        <LoadingBlock rows={6} />
      ) : (
        <div className="adm-stack">
          <div>
            <div className="adm-row">
              <h1 style={{ margin: 0, fontSize: 22 }}>{u.name}</h1>
              <Badge value={u.status} />
              <Badge value={u.role} />
              {u.role === 'COACH' && <Badge value={u.coachStatus} />}
              {u.minor && <Badge kind="amber" label={t('minor')} />}
            </div>
            <div className="adm-muted">{u.email} · <span className="adm-mono">{u.id}</span></div>
          </div>
          {u.minor && <Notice kind="warn">{t('minorNotice')}</Notice>}
          {can('users.manage') && (
            <div className="adm-row">
              {u.status === 'ACTIVE' ? (
                <button className="adm-btn danger" disabled={busy} onClick={async () => (await confirm({ title: t('suspend'), text: t('suspendConfirm'), danger: true, confirmLabel: t('suspend') })) && act(`users/${u.id}/status`, { status: 'SUSPENDED' })}>
                  <ShieldOff size={15} /> {t('suspend')}
                </button>
              ) : (
                <button className="adm-btn" disabled={busy} onClick={async () => (await confirm({ title: t('reactivate'), text: t('reactivateConfirm') })) && act(`users/${u.id}/status`, { status: 'ACTIVE' })}>
                  <UserCheck size={15} /> {t('reactivate')}
                </button>
              )}
              <select
                aria-label={t('changeRole')}
                value={u.role}
                disabled={busy}
                style={{ width: 'auto' }}
                onChange={async (e) => {
                  const role = e.target.value;
                  if (await confirm({ title: t('changeRole'), text: t('roleConfirm'), danger: true })) await act(`users/${u.id}/role`, { role });
                }}
              >
                <option value="INDEPENDENT">{t('INDEPENDENT')}</option>
                <option value="COACH">{t('COACH')}</option>
              </select>
              <button className="adm-btn" disabled={busy || !data.emailConfigured || u.status !== 'ACTIVE'} title={data.emailConfigured ? undefined : t('emailNotConfigured')} onClick={() => act(`users/${u.id}/reset-password`, {}, t('resetSent'))}>
                <KeyRound size={15} /> {t('sendReset')}
              </button>
              <button className="adm-btn" disabled={busy} onClick={() => act(`users/${u.id}/sessions/revoke`, {})}>
                <LogOut size={15} /> {t('signOutEverywhere')}
              </button>
              {can('users.delete') && (
                <button className="adm-btn danger" disabled={busy} onClick={() => setDeleteOpen(true)}>
                  <Trash2 size={15} /> {t('deleteAccount')}
                </button>
              )}
            </div>
          )}
          <div className="adm-grid two">
            <Card title={t('account')}>
              <dl className="adm-kv">
                <dt>{t('created')}</dt>
                <dd>{formatDate(u.createdAt, true)}</dd>
                <dt>{t('lastActive')}</dt>
                <dd>{u.lastActiveAt ? formatDate(u.lastActiveAt, true) : t('never')}</dd>
                <dt>{t('language')}</dt>
                <dd>{u.language === 'he' ? 'עברית' : 'English'}</dd>
                {u.phone && (
                  <>
                    <dt>Phone</dt>
                    <dd className="adm-mono">{u.phone}</dd>
                  </>
                )}
                {u.suspendedAt && (
                  <>
                    <dt>{t('SUSPENDED')}</dt>
                    <dd>{formatDate(u.suspendedAt, true)}</dd>
                  </>
                )}
              </dl>
            </Card>
            <Card title={t('entitlements')}>
              <dl className="adm-kv">
                <dt>{t('plan')}</dt>
                <dd>{t(data.entitlements.plan)}</dd>
                <dt>AI</dt>
                <dd>{data.entitlements.ai ? t('yes') : t('no')}</dd>
                <dt>{t('ads')}</dt>
                <dd>{data.entitlements.ads ? t('yes') : t('no')}</dd>
                {u.role === 'COACH' && (
                  <>
                    <dt>{t('clientLimit')}</dt>
                    <dd>{formatNumber(data.entitlements.clientLimit)}</dd>
                  </>
                )}
                <dt>{t('subscription')}</dt>
                <dd>
                  {data.subscription ? `${t(data.subscription.tier)} · ${t(data.subscription.status)}` : '—'}
                  {data.subscription?.cancelAtPeriodEnd && <div className="adm-cell-sub">{t('pendingCancellations')}</div>}
                  {data.subscription?.currentPeriodEnd && <div className="adm-cell-sub">{formatDate(data.subscription.currentPeriodEnd)}</div>}
                </dd>
              </dl>
              {can('billing.manage') && data.subscription?.provider && data.subscription.status === 'ACTIVE' && !data.subscription.cancelAtPeriodEnd && (
                <button className="adm-btn small danger" style={{ marginTop: 12 }} disabled={busy} onClick={async () => (await confirm({ title: t('cancelAtPeriodEnd'), text: t('cancelSubConfirm'), danger: true })) && act(`billing/subscriptions/${u.id}/cancel`, {})}>
                  {t('cancelAtPeriodEnd')}
                </button>
              )}
            </Card>
          </div>
          <Card title={t('grants')} actions={can('entitlements.manage') && <button className="adm-btn small primary" onClick={() => setGrantOpen(true)}>{t('addGrant')}</button>}>
            {data.grants.length ? (
              <div className="adm-list">
                {data.grants.map((g) => {
                  const live = !g.revokedAt && (!g.endsAt || new Date(g.endsAt) > new Date());
                  return (
                    <div key={g.id}>
                      <Badge kind={live ? 'green' : ''} label={t(g.kind)} />
                      <span style={{ flex: 1 }}>
                        {g.reason}
                        <div className="adm-cell-sub">
                          {t(g.source === 'PROMO' ? 'promotions' : 'ADMIN')} · {formatDate(g.startsAt)} → {g.endsAt ? formatDate(g.endsAt) : t('noExpiry')}
                          {g.revokedAt && ` · ${t('revoked')}`}
                        </div>
                      </span>
                      {live && can('entitlements.manage') && (
                        <button className="adm-btn small" disabled={busy} onClick={() => act(`users/${u.id}/grants/${g.id}/revoke`, {})}>
                          {t('revoke')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty />
            )}
          </Card>
          <div className="adm-grid two">
            <Card title={t('activity30')}>
              <dl className="adm-kv">
                <dt>{t('activeDays')}</dt>
                <dd>{formatNumber(data.activity.activeDays30)}</dd>
                <dt>{t('workouts')}</dt>
                <dd>{formatNumber(data.activity.workouts30)}</dd>
                <dt>{t('mealEntries')}</dt>
                <dd>{formatNumber(data.activity.mealEntries30)}</dd>
                <dt>{t('activeSessions')}</dt>
                <dd>{formatNumber(data.activity.activeSessions)}</dd>
              </dl>
            </Card>
            <Card title={u.role === 'COACH' ? t('clientsOf') : t('coachLinks')}>
              {(u.role === 'COACH' ? data.clients : data.coaches).length ? (
                <div className="adm-list">
                  {u.role === 'COACH'
                    ? data.clients.map((c) => (
                        <div key={c.id}>
                          <span style={{ flex: 1 }}>{c.client.name}</span>
                          <Badge value={c.status} />
                        </div>
                      ))
                    : data.coaches.map((c) => (
                        <div key={c.id}>
                          <span style={{ flex: 1 }}>
                            {c.coach.name}
                            <div className="adm-cell-sub">{c.coach.email}</div>
                          </span>
                          <Badge value={c.status} />
                        </div>
                      ))}
                </div>
              ) : (
                <Empty />
              )}
            </Card>
          </div>
          <div className="adm-grid two">
            <Card title={t('recentEvents')}>
              {data.events.length ? (
                <div className="adm-list">
                  {data.events.slice(0, 15).map((e, i) => (
                    <div key={i}>
                      <span className="adm-mono" style={{ flex: 1 }}>{e.action}</span>
                      <span className="adm-small adm-muted">{formatDate(e.createdAt, true)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Card>
            <Card title={`${t('tickets')} / ${t('reportsAbout')}`}>
              {[...data.tickets, ...data.reports].length ? (
                <div className="adm-list">
                  {[...data.reports.map((r) => ({ ...r, about: true })), ...data.tickets.map((r) => ({ ...r, about: false }))].map((ticket) => (
                    <div key={ticket.id}>
                      <button className="adm-btn ghost small" style={{ flex: 1, justifyContent: 'flex-start' }} onClick={() => navigate('support', { ticket: ticket.id })}>
                        {ticket.subject}
                      </button>
                      {ticket.about && <Badge kind="red" label={t(ticket.category)} />}
                      <Badge value={ticket.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Card>
          </div>
          {data.payments && (
            <Card title={t('payments')}>
              {data.payments.length ? (
                <div className="adm-list">
                  {data.payments.map((p) => (
                    <div key={p.id}>
                      <span style={{ flex: 1 }}>{formatDate(p.createdAt)}</span>
                      <strong>{formatMoney(p.amount / 100, p.currency)}</strong>
                      <Badge label={p.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Card>
          )}
          {u.role === 'COACH' && can('coaches.manage') && <CoachControls user={u} onSaved={() => { void reload(); onChanged(); }} />}
        </div>
      )}
      {grantOpen && u && <GrantDialog userId={u.id} role={u.role} onClose={() => setGrantOpen(false)} onSaved={() => { setGrantOpen(false); void reload(); onChanged(); }} />}
      {deleteOpen && u && (
        <DeleteDialog
          email={data!.user.email}
          minor={u.minor}
          onClose={() => setDeleteOpen(false)}
          onConfirm={async (confirmEmail) => {
            if (await act(`users/${u.id}/delete`, { confirmEmail })) {
              setDeleteOpen(false);
              onClose();
            }
          }}
        />
      )}
    </Drawer>
  );
}

function GrantDialog({ userId, role, onClose, onSaved }: { userId: string; role: string; onClose: () => void; onSaved: () => void }) {
  const { t, api, toast, fail } = useAdmin();
  const [kind, setKind] = useState('PREMIUM'),
    [days, setDays] = useState('30'),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={t('addGrant')}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn" onClick={onClose}>{t('cancel')}</button>
          <button
            className="adm-btn primary"
            disabled={busy || reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`users/${userId}/grants`, { kind, days: days ? Number(days) : null, reason });
                toast(t('saved'));
                onSaved();
              } catch (e) {
                fail(e);
                setBusy(false);
              }
            }}
          >
            {t('save')}
          </button>
        </>
      }
    >
      <div className="adm-form">
        <Notice>{t('storeNotice')}</Notice>
        <Field label={t('grantKind')}>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {['PREMIUM', 'AD_FREE', 'AI', ...(role === 'COACH' ? ['COACH'] : [])].map((k) => (
              <option key={k} value={k}>{t(k)}</option>
            ))}
          </select>
        </Field>
        <Field label={t('days')} hint={t('noExpiry') + ': ' + t('none').toLowerCase()}>
          <input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <Field label={t('reason')}>
          <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function DeleteDialog({ email, minor, onClose, onConfirm }: { email: string; minor: boolean; onClose: () => void; onConfirm: (email: string) => void }) {
  const { t } = useAdmin();
  const [value, setValue] = useState('');
  return (
    <Modal
      title={t('deleteAccount')}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn" onClick={onClose}>{t('cancel')}</button>
          <button className="adm-btn danger solid" disabled={!value.includes('@')} onClick={() => onConfirm(value)}>
            <Trash2 size={15} /> {t('delete')}
          </button>
        </>
      }
    >
      <div className="adm-form">
        <Notice kind="danger">{t('deleteWarning')}</Notice>
        <Field label={t('typeEmail')} hint={minor ? undefined : email}>
          <input value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" dir="ltr" />
        </Field>
      </div>
    </Modal>
  );
}

function CoachControls({ user, onSaved }: { user: UserDetail['user']; onSaved: () => void }) {
  const { t, api, toast, fail } = useAdmin();
  const [verified, setVerified] = useState(!!user.coachVerifiedAt),
    [credentials, setCredentials] = useState(user.coachCredentials),
    [limit, setLimit] = useState(user.coachClientLimit == null ? '' : String(user.coachClientLimit)),
    [busy, setBusy] = useState(false);
  return (
    <Card title={t('credentials')}>
      <div className="adm-form">
        <Switch label={<><BadgeCheck size={15} /> {t('markVerified')}</>} checked={verified} onChange={setVerified} />
        <Field label={t('credentials')}>
          <textarea value={credentials} maxLength={1000} onChange={(e) => setCredentials(e.target.value)} />
        </Field>
        <Field label={t('limitOverride')} hint={t('planDefault') + ': ' + t('none').toLowerCase()}>
          <input type="number" min={0} max={1000} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <div>
          <button
            className="adm-btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`coaches/${user.id}/verify`, { verified, credentials });
                await api(`coaches/${user.id}/limit`, { limit: limit === '' ? null : Number(limit) });
                toast(t('saved'));
                onSaved();
              } catch (e) {
                fail(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('save')}
          </button>
        </div>
      </div>
    </Card>
  );
}

type CoachRow = { id: string; name: string; email: string; status: string; coachStatus: string; verified: boolean; clientLimit: number | null; plan: string; activeClients: number; pendingClients: number; programs: number; openComplaints: number; createdAt: string; lastActiveAt: string | null };

export function CoachesSection() {
  const { t, formatDate, formatNumber, api, toast, fail, confirm, can, params } = useAdmin();
  const [query, update, qs] = useQueryState({ q: '', status: params.get('status') || '', verified: '', sort: '', page: '1' });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => update({ q: search }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const { data, error, reload } = useLoad<Paged<CoachRow> & { statusCounts: Record<string, number> }>(`coaches?${qs}`, [qs]);
  async function setStatus(row: CoachRow, status: string) {
    if ((status === 'REVOKED' || status === 'REJECTED') && !(await confirm({ title: t(status === 'REVOKED' ? 'revokeCoach' : 'reject'), text: t('revokeCoachConfirm'), danger: true }))) return;
    try {
      await api(`coaches/${row.id}/status`, { status });
      toast(t('saved'));
      await reload();
    } catch (e) {
      fail(e);
    }
  }
  return (
    <>
      <PageHead title={t('navCoaches')} subtitle={t('coachesSub')} />
      <div className="adm-toolbar">
        <input type="search" placeholder={t('search')} aria-label={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label={t('status')} value={query.status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">{t('status')}: {t('all')}</option>
          {['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'].map((s) => (
            <option key={s} value={s}>
              {t(s)} {data?.statusCounts[s] ? `(${data.statusCounts[s]})` : ''}
            </option>
          ))}
        </select>
        <select aria-label={t('verified')} value={query.verified} onChange={(e) => update({ verified: e.target.value })}>
          <option value="">{t('verified')}: {t('all')}</option>
          <option value="yes">{t('verified')}</option>
          <option value="no">{t('unverified')}</option>
        </select>
        <select aria-label={t('actions')} value={query.sort} onChange={(e) => update({ sort: e.target.value })}>
          <option value="">{t('sortNewest')}</option>
          <option value="clients">{t('activeClients')}</option>
        </select>
      </div>
      {error && <ErrorState code={error} onRetry={() => void reload()} />}
      {!data ? (
        <LoadingBlock rows={6} />
      ) : (
        <>
          <Table
            rows={data.items}
            columns={[
              { key: 'name', label: t('name'), render: (c) => (<button className="adm-btn ghost small" style={{ padding: 0, flexDirection: 'column', alignItems: 'flex-start' }} onClick={() => setSelected(c.id)}><span className="adm-cell-main">{c.name} {c.verified && <BadgeCheck size={14} color="var(--a-brand)" aria-label={t('verified')} />}</span><span className="adm-cell-sub">{c.email}</span></button>) },
              { key: 'status', label: t('status'), render: (c) => (<div className="adm-row"><Badge value={c.coachStatus} />{c.status === 'SUSPENDED' && <Badge value="SUSPENDED" />}</div>) },
              { key: 'plan', label: t('plan'), render: (c) => t(c.plan) },
              { key: 'clients', label: t('activeClients'), className: 'num', render: (c) => (<>{formatNumber(c.activeClients)}{c.clientLimit != null && <span className="adm-muted"> / {c.clientLimit}</span>}{c.pendingClients > 0 && <div className="adm-cell-sub">+{c.pendingClients} {t('PENDING').toLowerCase()}</div>}</>) },
              { key: 'complaints', label: t('complaints'), className: 'num', render: (c) => (c.openComplaints ? <Badge kind="red" label={formatNumber(c.openComplaints)} /> : '0') },
              { key: 'active', label: t('lastActive'), render: (c) => (c.lastActiveAt ? formatDate(c.lastActiveAt) : t('never')) },
              {
                key: 'actions',
                label: t('actions'),
                render: (c) =>
                  can('coaches.manage') ? (
                    <div className="adm-row">
                      {c.coachStatus !== 'APPROVED' && (
                        <button className="adm-btn small primary" onClick={() => setStatus(c, 'APPROVED')}>
                          {c.coachStatus === 'PENDING' ? t('approve') : t('restoreCoach')}
                        </button>
                      )}
                      {c.coachStatus === 'PENDING' && (
                        <button className="adm-btn small danger" onClick={() => setStatus(c, 'REJECTED')}>
                          {t('reject')}
                        </button>
                      )}
                      {c.coachStatus === 'APPROVED' && (
                        <button className="adm-btn small danger" onClick={() => setStatus(c, 'REVOKED')}>
                          {t('revokeCoach')}
                        </button>
                      )}
                    </div>
                  ) : null,
              },
            ]}
          />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => update({ page: String(page) })} />
        </>
      )}
      {selected && <UserDrawer id={selected} onClose={() => setSelected(null)} onChanged={() => void reload()} />}
    </>
  );
}
