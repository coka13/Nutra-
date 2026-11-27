'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Download, KeyRound, Play, Plus, RotateCcw, Send, ShieldCheck, XCircle } from 'lucide-react';
import {
  Badge,
  Card,
  DateRange,
  Drawer,
  Empty,
  ErrorState,
  Field,
  LoadingBlock,
  Modal,
  Notice,
  PageHead,
  Pagination,
  Segment,
  Stat,
  StatsSkeleton,
  Switch,
  Table,
  useAdmin,
  useDateRange,
  useLoad,
} from './ui';
import { TimeChart } from './charts';

type Config = {
  features: { userRegistration: boolean; coachRegistration: boolean; coachApprovalRequired: boolean; beta: Record<string, boolean> };
  maintenance: { enabled: boolean; messageEn: string; messageHe: string };
  app: { minimumVersion: string; latestVersion: string; updateMode: 'none' | 'optional' | 'mandatory'; noticeEn: string; noticeHe: string };
};
type ConfigData = { version: number; config: Config; history: { version: number; note: string; createdBy: string; createdAt: string }[]; flags: { key: string; enabled: boolean }[] };

export function ConfigSection() {
  const { t, can, api, toast, fail, confirm, formatDate } = useAdmin();
  const { data, error, reload } = useLoad<ConfigData>('config');
  const [draft, setDraft] = useState<Config | null>(null),
    [note, setNote] = useState(''),
    [newFlag, setNewFlag] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setDraft({ features: data.config.features, maintenance: data.config.maintenance, app: data.config.app });
  }, [data]);
  const manage = can('config.manage');
  if (error) return <ErrorState code={error} onRetry={() => void reload()} />;
  if (!data || !draft) return <><PageHead title={t('navConfig')} subtitle={t('configSub')} /><LoadingBlock rows={6} /></>;
  const f = draft.features,
    m = draft.maintenance,
    a = draft.app;
  const set = (patch: Partial<Config>) => setDraft({ ...draft, ...patch });
  return (
    <>
      <PageHead title={t('navConfig')} subtitle={t('configSub')}>
        <Badge kind="green" label={`${t('liveVersion')}: v${data.version}`} />
      </PageHead>
      {m.enabled && <Notice kind="danger">{t('maintenanceWarn')}</Notice>}
      <div className="adm-grid two">
        <div className="adm-stack">
          <Card title={t('registration')}>
            <div className="adm-form">
              <Switch label={t('userRegistration')} checked={f.userRegistration} disabled={!manage} onChange={(v) => set({ features: { ...f, userRegistration: v } })} />
              <Switch label={t('coachRegistration')} checked={f.coachRegistration} disabled={!manage} onChange={(v) => set({ features: { ...f, coachRegistration: v } })} />
              <Switch label={t('coachApprovalRequired')} checked={f.coachApprovalRequired} disabled={!manage} onChange={(v) => set({ features: { ...f, coachApprovalRequired: v } })} />
            </div>
          </Card>
          <Card title={t('betaFeatures')}>
            <div className="adm-form">
              {Object.keys(f.beta).length === 0 && <p className="adm-muted" style={{ margin: 0 }}>—</p>}
              {Object.entries(f.beta).map(([key, on]) => (
                <div className="adm-spread" key={key}>
                  <Switch label={<span className="adm-mono">{key}</span>} checked={on} disabled={!manage} onChange={(v) => set({ features: { ...f, beta: { ...f.beta, [key]: v } } })} />
                  {manage && (
                    <button className="adm-btn small ghost" onClick={() => { const beta = { ...f.beta }; delete beta[key]; set({ features: { ...f, beta } }); }}>
                      {t('delete')}
                    </button>
                  )}
                </div>
              ))}
              {manage && (
                <div className="adm-row">
                  <input className="adm-mono" placeholder={t('betaKey')} value={newFlag} onChange={(e) => setNewFlag(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))} style={{ flex: 1 }} />
                  <button className="adm-btn small" disabled={!/^[a-z][a-zA-Z0-9]{1,39}$/.test(newFlag)} onClick={() => { set({ features: { ...f, beta: { ...f.beta, [newFlag]: false } } }); setNewFlag(''); }}>
                    <Plus size={14} /> {t('addFlag')}
                  </button>
                </div>
              )}
            </div>
          </Card>
          <Card title={t('legacyFlags')}>
            {data.flags.length ? (
              data.flags.map((flag) => (
                <Switch
                  key={flag.key}
                  label={<span className="adm-mono">{flag.key}</span>}
                  checked={flag.enabled}
                  disabled={!manage}
                  onChange={async (enabled) => {
                    try {
                      await api('config/flags', { key: flag.key, enabled });
                      await reload();
                    } catch (e) {
                      fail(e);
                    }
                  }}
                />
              ))
            ) : (
              <Switch label={<span className="adm-mono">marketplace</span>} checked={false} disabled={!manage} onChange={async (enabled) => { try { await api('config/flags', { key: 'marketplace', enabled }); await reload(); } catch (e) { fail(e); } }} />
            )}
          </Card>
        </div>
        <div className="adm-stack">
          <Card title={t('maintenanceMode')}>
            <div className="adm-form">
              <Switch label={t('maintenanceMode')} checked={m.enabled} disabled={!manage} onChange={(v) => set({ maintenance: { ...m, enabled: v } })} />
              <Field label={t('messageEn')}><input maxLength={500} disabled={!manage} value={m.messageEn} onChange={(e) => set({ maintenance: { ...m, messageEn: e.target.value } })} /></Field>
              <Field label={t('messageHe')}><input dir="rtl" maxLength={500} disabled={!manage} value={m.messageHe} onChange={(e) => set({ maintenance: { ...m, messageHe: e.target.value } })} /></Field>
            </div>
          </Card>
          <Card title={t('appVersions')}>
            <div className="adm-form cols">
              <Field label={t('minimumVersion')}><input className="adm-mono" disabled={!manage} value={a.minimumVersion} onChange={(e) => set({ app: { ...a, minimumVersion: e.target.value } })} /></Field>
              <Field label={t('latestVersion')}><input className="adm-mono" disabled={!manage} value={a.latestVersion} onChange={(e) => set({ app: { ...a, latestVersion: e.target.value } })} /></Field>
              <Field className="full" label={t('updateMode')}>
                <Segment value={a.updateMode} onChange={(v) => manage && set({ app: { ...a, updateMode: v } })} options={(['none', 'optional', 'mandatory'] as const).map((v) => ({ value: v, label: t('update_' + v) }))} />
              </Field>
              <Field className="full" label={t('noticeEn')}><input maxLength={500} disabled={!manage} value={a.noticeEn} onChange={(e) => set({ app: { ...a, noticeEn: e.target.value } })} /></Field>
              <Field className="full" label={t('noticeHe')}><input dir="rtl" maxLength={500} disabled={!manage} value={a.noticeHe} onChange={(e) => set({ app: { ...a, noticeHe: e.target.value } })} /></Field>
            </div>
          </Card>
          {manage && (
            <Card>
              <div className="adm-row">
                <input placeholder={t('changeNote')} value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
                <button
                  className="adm-btn primary"
                  disabled={busy || note.trim().length < 3}
                  onClick={async () => {
                    if (!(await confirm({ title: t('publish'), text: t('publishConfirm'), danger: m.enabled }))) return;
                    setBusy(true);
                    try {
                      await api('config', { ...draft, note, baseVersion: data.version });
                      toast(t('saved'));
                      setNote('');
                      await reload();
                    } catch (e) {
                      fail(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t('publish')}
                </button>
              </div>
            </Card>
          )}
        </div>
      </div>
      <Card title={t('versions')} className="adm-space-top">
        <Table
          rows={data.history}
          rowKey={(h) => String(h.version)}
          columns={[
            { key: 'v', label: t('version'), render: (h) => (<>v{h.version} {h.version === data.version && <Badge kind="green" label={t('liveVersion')} />}</>) },
            { key: 'n', label: t('changeNote'), render: (h) => h.note },
            { key: 'b', label: t('administrator'), render: (h) => h.createdBy },
            { key: 'd', label: t('time'), render: (h) => formatDate(h.createdAt, true) },
            {
              key: 'a',
              label: t('actions'),
              render: (h) =>
                manage && h.version !== data.version ? (
                  <button
                    className="adm-btn small"
                    onClick={async () => {
                      if (!(await confirm({ title: t('rollback'), text: t('rollbackConfirm', { v: h.version }) }))) return;
                      try {
                        await api('config/rollback', { version: h.version });
                        toast(t('saved'));
                        await reload();
                      } catch (e) {
                        fail(e);
                      }
                    }}
                  >
                    <RotateCcw size={13} /> {t('rollback')}
                  </button>
                ) : null,
            },
          ]}
        />
      </Card>
    </>
  );
}

type Ticket = { id: string; email: string; category: string; subject: string; status: string; priority: string; assigneeId: string | null; reportedUserId: string | null; userId: string | null; createdAt: string; updatedAt: string; _count: { messages: number } };

export function SupportSection() {
  const { t, formatDate, params } = useAdmin();
  const [filters, setFilters] = useState({ q: '', status: 'active', priority: '', category: '', assignee: '', page: '1' });
  const [search, setSearch] = useState(''),
    [open, setOpen] = useState<string | null>(params.get('ticket'));
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => ({ ...f, q: search, page: '1' })), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const { data, error, reload } = useLoad<{ items: Ticket[]; total: number; page: number; pageSize: number; statusCounts: Record<string, number>; assignees: { id: string; name: string }[] }>(`tickets?${qs}`, [qs]);
  const set = (patch: Partial<typeof filters>) => setFilters({ ...filters, page: '1', ...patch });
  const names = new Map(data?.assignees.map((a) => [a.id, a.name]));
  return (
    <>
      <PageHead title={t('navSupport')} subtitle={t('supportSub2')} />
      {data && (
        <div className="adm-grid stats" style={{ marginBottom: 16 }}>
          {['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED'].map((s) => (
            <Stat key={s} label={t(s)} value={data.statusCounts[s] ?? 0} />
          ))}
        </div>
      )}
      <div className="adm-toolbar">
        <input type="search" placeholder={t('search')} aria-label={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label={t('status')} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="active">{t('openTickets')}</option>
          <option value="">{t('status')}: {t('all')}</option>
          {['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
        </select>
        <select aria-label={t('priority')} value={filters.priority} onChange={(e) => set({ priority: e.target.value })}>
          <option value="">{t('priority')}: {t('all')}</option>
          {['URGENT', 'HIGH', 'NORMAL', 'LOW'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
        </select>
        <select aria-label={t('category')} value={filters.category} onChange={(e) => set({ category: e.target.value })}>
          <option value="">{t('category')}: {t('all')}</option>
          {['SUPPORT', 'BUG', 'FEATURE', 'COMPLAINT', 'REPORT'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
        </select>
        <select aria-label={t('assignee')} value={filters.assignee} onChange={(e) => set({ assignee: e.target.value })}>
          <option value="">{t('assignee')}: {t('all')}</option>
          <option value="me">{t('assignedToMe')}</option>
          <option value="none">{t('unassigned')}</option>
        </select>
      </div>
      {error && <ErrorState code={error} onRetry={() => void reload()} />}
      {!data ? (
        <LoadingBlock rows={6} />
      ) : (
        <>
          <Table
            rows={data.items}
            onRowClick={(row) => setOpen(row.id)}
            columns={[
              { key: 's', label: t('subject'), render: (x) => (<><div className="adm-cell-main">{x.subject}</div><div className="adm-cell-sub">{x.email} · {x._count.messages} {t('messages').toLowerCase()}</div></>) },
              { key: 'c', label: t('category'), render: (x) => <Badge label={t(x.category)} kind={x.category === 'REPORT' || x.category === 'COMPLAINT' ? 'red' : x.category === 'BUG' ? 'amber' : ''} /> },
              { key: 'p', label: t('priority'), render: (x) => <Badge value={x.priority} /> },
              { key: 'st', label: t('status'), render: (x) => <Badge value={x.status} /> },
              { key: 'a', label: t('assignee'), render: (x) => (x.assigneeId ? names.get(x.assigneeId) ?? '—' : <span className="adm-muted">{t('unassigned')}</span>) },
              { key: 'u', label: t('updated'), render: (x) => formatDate(x.updatedAt, true) },
            ]}
          />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setFilters({ ...filters, page: String(page) })} />
        </>
      )}
      {open && data && <TicketDrawer id={open} assignees={data.assignees} onClose={() => setOpen(null)} onChanged={() => void reload()} />}
    </>
  );
}

function TicketDrawer({ id, assignees, onClose, onChanged }: { id: string; assignees: { id: string; name: string }[]; onClose: () => void; onChanged: () => void }) {
  const { t, api, toast, fail, can, formatDate, navigate } = useAdmin();
  const { data, error, reload } = useLoad<{
    ticket: Ticket & { messages: { id: string; authorType: string; adminName: string; body: string; internal: boolean; createdAt: string }[] };
    user: { id: string; name: string; role: string; status: string } | null;
    reported: { id: string; name: string; role: string; status: string; coachStatus: string } | null;
  }>(`tickets/${id}`, [id]);
  const [body, setBody] = useState(''),
    [internal, setInternal] = useState(false),
    [busy, setBusy] = useState(false);
  const manage = can('support.manage');
  async function update(patch: Record<string, unknown>) {
    try {
      await api(`tickets/${id}`, patch);
      await reload();
      onChanged();
    } catch (e) {
      fail(e);
    }
  }
  return (
    <Drawer onClose={onClose} label={data?.ticket.subject ?? t('details')}>
      {error && <ErrorState code={error} onRetry={() => void reload()} />}
      {!data ? (
        <LoadingBlock />
      ) : (
        <div className="adm-stack">
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>{data.ticket.subject}</h1>
            <div className="adm-row" style={{ marginTop: 6 }}>
              <Badge label={t(data.ticket.category)} />
              <span className="adm-muted adm-small">{formatDate(data.ticket.createdAt, true)}</span>
            </div>
          </div>
          <div className="adm-form cols">
            <Field label={t('status')}>
              <select disabled={!manage} value={data.ticket.status} onChange={(e) => update({ status: e.target.value })}>
                {['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
              </select>
            </Field>
            <Field label={t('priority')}>
              <select disabled={!manage} value={data.ticket.priority} onChange={(e) => update({ priority: e.target.value })}>
                {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
              </select>
            </Field>
            <Field label={t('assignee')}>
              <select disabled={!manage} value={data.ticket.assigneeId ?? ''} onChange={(e) => update({ assigneeId: e.target.value || null })}>
                <option value="">{t('unassigned')}</option>
                {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </div>
          <Card>
            <dl className="adm-kv">
              <dt>{t('submitter')}</dt>
              <dd>
                {data.user ? (
                  <button className="adm-btn ghost small" style={{ padding: 0 }} onClick={() => navigate('users', { user: data.user!.id })}>{data.user.name} · {t(data.user.role)}</button>
                ) : (
                  data.ticket.email
                )}
              </dd>
              {data.reported && (
                <>
                  <dt>{t('reportedAccount')}</dt>
                  <dd>
                    <button className="adm-btn ghost small" style={{ padding: 0 }} onClick={() => navigate('users', { user: data.reported!.id })}>{data.reported.name}</button> <Badge value={data.reported.role} /> <Badge value={data.reported.status} />
                  </dd>
                </>
              )}
            </dl>
          </Card>
          <div className="adm-thread">
            {data.ticket.messages.map((msg) => (
              <div key={msg.id} className={`adm-msg ${msg.internal ? 'internal' : msg.authorType === 'ADMIN' ? 'admin' : ''}`}>
                <small>
                  {msg.authorType === 'ADMIN' ? msg.adminName || t('ADMIN') : t('USER')} · {formatDate(msg.createdAt, true)} {msg.internal && `· ${t('internalNote')}`}
                </small>
                {msg.body}
              </div>
            ))}
          </div>
          {manage && (
            <div className="adm-form">
              <Segment value={internal ? 'internal' : 'reply'} onChange={(v) => setInternal(v === 'internal')} options={[{ value: 'reply', label: t('reply') }, { value: 'internal', label: t('internalNote') }]} />
              {internal && <p className="adm-small adm-muted" style={{ margin: 0 }}>{t('internalHint')}</p>}
              <textarea rows={4} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
              <div>
                <button
                  className="adm-btn primary"
                  disabled={busy || !body.trim()}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`tickets/${id}/reply`, { body, internal });
                      setBody('');
                      toast(t('saved'));
                      await reload();
                      onChanged();
                    } catch (e) {
                      fail(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Send size={15} /> {t(internal ? 'save' : 'send')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

type SystemData = {
  health: { status: string; database: { ok: boolean; latencyMs: number; provider: string }; uptimeSeconds: number; memoryMb: number; load: number };
  versions: Record<string, string | null>;
  traffic: { requests24h: number; errorRate24h: number; routes: { route: string; requests: number; errors: number; clientErrors: number; avgMs: number; maxMs: number }[]; hourly: { hour: string; requests: number; errors: number; avgMs: number }[] };
  failures: { id: string; route: string; method: string; status: number; code: string; durationMs: number; createdAt: string }[];
  jobs: { job: string; last: { status: string; detail: string; startedAt: string; finishedAt: string | null } | null }[];
  backups: { directory: string | null; files: { name: string; bytes: number; createdAt: string }[] };
  storage: { databaseBytes: number; photoBytes: number; brandingBytes: number };
  aiProviders: { id: string; name: string; enabled: boolean; lastStatus: string; lastCheckedAt: string | null }[];
  configuration: Record<string, boolean>;
};

export function SystemSection() {
  const { t, can, api, toast, fail, formatNumber, formatBytes, formatDate } = useAdmin();
  const { data, error, reload } = useLoad<SystemData>('system');
  const [running, setRunning] = useState<string | null>(null);
  if (error) return <ErrorState code={error} onRetry={() => void reload()} />;
  const uptime = (s: number) => (s > 86400 ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);
  return (
    <>
      <PageHead title={t('navSystem')} subtitle={t('systemSub')}>
        <button className="adm-btn" onClick={() => void reload()}>{t('retry')}</button>
      </PageHead>
      {!data ? (
        <StatsSkeleton count={6} />
      ) : (
        <div className="adm-stack">
          <div className="adm-grid stats">
            <Stat label={t('health')} value={<Badge value={data.health.status} label={t(data.health.status)} />} foot={<span className="adm-stat-foot">{t('uptime')}: {uptime(data.health.uptimeSeconds)}</span>} />
            <Stat label={t('database')} value={data.health.database.ok ? `${data.health.database.latencyMs} ms` : t('down')} foot={<span className="adm-stat-foot">{data.health.database.provider} · {formatBytes(data.storage.databaseBytes)}</span>} />
            <Stat label={t('requests')} value={formatNumber(data.traffic.requests24h)} foot={<span className="adm-stat-foot">{t('traffic24h')}</span>} />
            <Stat label={t('errorRate')} value={`${formatNumber(data.traffic.errorRate24h, 2)}%`} />
            <Stat label={t('memory')} value={`${formatNumber(data.health.memoryMb)} MB`} foot={<span className="adm-stat-foot">load {formatNumber(data.health.load, 2)}</span>} />
            <Stat label={t('storage')} value={formatBytes(data.storage.photoBytes + data.storage.brandingBytes)} foot={<span className="adm-stat-foot">{t('photos')}: {formatBytes(data.storage.photoBytes)}</span>} />
          </div>
          <Card title={t('traffic24h')}>
            <TimeChart data={data.traffic.hourly} xKey="hour" series={[{ key: 'requests', label: t('requests'), color: 'var(--chart-3)' }, { key: 'errors', label: t('errorRate'), color: 'var(--chart-5)', kind: 'bar' }, { key: 'avgMs', label: t('avgLatency'), color: 'var(--chart-4)', axis: 'right' }]} />
          </Card>
          <div className="adm-grid two">
            <Card title={t('jobs')}>
              <div className="adm-list">
                {data.jobs.map((j) => (
                  <div key={j.job}>
                    <span style={{ flex: 1 }}>
                      <span className="adm-cell-main">{t('job_' + j.job)}</span>
                      <div className="adm-cell-sub">{j.last ? `${formatDate(j.last.startedAt, true)} · ${j.last.detail}` : t('never')}</div>
                    </span>
                    {j.last && <Badge value={j.last.status} />}
                    {can('system.manage') && (
                      <button
                        className="adm-btn small"
                        disabled={running === j.job}
                        onClick={async () => {
                          setRunning(j.job);
                          try {
                            const r = await api<{ status: string; detail: string }>(`system/jobs/${j.job}`, {});
                            toast(`${t('job_' + j.job)}: ${r.detail}`, r.status === 'FAILED' ? 'error' : 'ok');
                            await reload();
                          } catch (e) {
                            fail(e);
                          } finally {
                            setRunning(null);
                          }
                        }}
                      >
                        <Play size={13} /> {t('runNow')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
            <Card title={t('backups')}>
              {data.backups.files.length ? (
                <div className="adm-list">
                  {data.backups.files.map((b) => (
                    <div key={b.name}>
                      <span className="adm-mono" style={{ flex: 1 }}>{b.name}</span>
                      <span className="adm-small adm-muted">{formatBytes(b.bytes)}</span>
                      <span className="adm-small adm-muted">{formatDate(b.createdAt, true)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty text={t('noBackups')} />
              )}
            </Card>
            <Card title={t('integrations')}>
              <div className="adm-list">
                {Object.entries(data.configuration).map(([key, ok]) => (
                  <div key={key}>
                    {ok ? <CheckCircle2 size={16} color="var(--a-brand)" /> : <XCircle size={16} color="var(--a-danger)" />}
                    <span style={{ flex: 1 }}>{t('check_' + key)}</span>
                  </div>
                ))}
                {data.aiProviders.map((p) => (
                  <div key={p.id}>
                    {p.lastStatus === 'ok' ? <CheckCircle2 size={16} color="var(--a-brand)" /> : <XCircle size={16} color={p.enabled && p.lastStatus !== 'unknown' ? 'var(--a-danger)' : 'var(--a-muted)'} />}
                    <span style={{ flex: 1 }}>{p.name}</span>
                    <span className="adm-small adm-muted">{p.lastStatus}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card title={t('versionsTitle')}>
              <dl className="adm-kv">
                {Object.entries(data.versions).map(([k, v]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt>{k}</dt>
                    <dd className="adm-mono">{v ?? '—'}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
          <Card title={t('route')}>
            <Table
              rows={data.traffic.routes}
              rowKey={(r) => r.route}
              columns={[
                { key: 'r', label: t('route'), render: (r) => <span className="adm-mono">{r.route}</span> },
                { key: 'n', label: t('requests'), className: 'num', render: (r) => formatNumber(r.requests) },
                { key: 'e', label: '5xx', className: 'num', render: (r) => (r.errors ? <Badge kind="red" label={formatNumber(r.errors)} /> : '0') },
                { key: 'c', label: '4xx', className: 'num', render: (r) => formatNumber(r.clientErrors) },
                { key: 'a', label: t('avgLatency'), className: 'num', render: (r) => `${formatNumber(r.avgMs)} ms` },
                { key: 'm', label: t('maxLatency'), className: 'num', render: (r) => `${formatNumber(r.maxMs)} ms` },
              ]}
            />
          </Card>
          <Card title={t('failedRequests')}>
            <Table
              rows={data.failures}
              columns={[
                { key: 't', label: t('time'), render: (f) => formatDate(f.createdAt, true) },
                { key: 'r', label: t('route'), render: (f) => <span className="adm-mono">{f.method} {f.route}</span> },
                { key: 's', label: t('status'), render: (f) => <Badge kind={f.status >= 500 ? 'red' : 'amber'} label={String(f.status)} /> },
                { key: 'c', label: t('error'), render: (f) => <span className="adm-mono">{f.code}</span> },
                { key: 'd', label: t('latency'), className: 'num', render: (f) => `${f.durationMs} ms` },
              ]}
            />
          </Card>
        </div>
      )}
    </>
  );
}

type AdminRow = { id: string; email: string; name: string; role: string; status: string; lastLoginAt: string | null; createdAt: string; mfa: boolean; lockedUntil: string | null; inviteExpiresAt: string | null; sessions: number };
const ROLES = ['SUPER_ADMIN', 'SUPPORT_ADMIN', 'CONTENT_MANAGER', 'FINANCE_ADMIN', 'TECHNICAL_ADMIN'];

export function AdminsSection() {
  const { t, me, api, toast, fail, confirm, formatDate } = useAdmin();
  const { data, error, reload } = useLoad<{ admins: AdminRow[] }>('admins');
  const [inviting, setInviting] = useState(false),
    [link, setLink] = useState<string | null>(null);
  async function act(path: string, body: unknown) {
    try {
      const r = await api<{ inviteUrl?: string }>(path, body);
      if (r.inviteUrl) setLink(r.inviteUrl);
      toast(t('saved'));
      await reload();
    } catch (e) {
      fail(e);
    }
  }
  return (
    <>
      <PageHead title={t('navAdmins')} subtitle={t('adminsSub')}>
        <button className="adm-btn primary" onClick={() => setInviting(true)}><Plus size={15} /> {t('inviteAdmin')}</button>
      </PageHead>
      {error && <ErrorState code={error} onRetry={() => void reload()} />}
      {!data ? (
        <LoadingBlock />
      ) : (
        <Table
          rows={data.admins}
          columns={[
            { key: 'n', label: t('name'), render: (a) => (<><div className="adm-cell-main">{a.name} {a.id === me.id && <Badge kind="blue" label={t('you')} />}</div><div className="adm-cell-sub">{a.email}</div></>) },
            {
              key: 'r',
              label: t('role'),
              render: (a) =>
                a.id === me.id ? (
                  t(a.role)
                ) : (
                  <select value={a.role} style={{ width: 'auto' }} onChange={async (e) => { const role = e.target.value; if (await confirm({ title: t('changeRole'), text: `${a.email} → ${t(role)}` })) await act(`admins/${a.id}`, { role }); }}>
                    {ROLES.map((r) => <option key={r} value={r}>{t(r)}</option>)}
                  </select>
                ),
            },
            { key: 's', label: t('status'), render: (a) => (<div className="adm-row"><Badge value={a.status} />{a.lockedUntil && new Date(a.lockedUntil) > new Date() && <Badge kind="red" label={t('locked')} />}</div>) },
            { key: 'm', label: t('mfa'), render: (a) => (a.mfa ? <ShieldCheck size={16} color="var(--a-brand)" aria-label={t('yes')} /> : <span className="adm-muted">—</span>) },
            { key: 'l', label: t('lastLogin'), render: (a) => (a.lastLoginAt ? formatDate(a.lastLoginAt, true) : t('never')) },
            { key: 'se', label: t('sessions'), className: 'num', render: (a) => a.sessions },
            {
              key: 'x',
              label: t('actions'),
              render: (a) =>
                a.id === me.id ? null : (
                  <div className="adm-row">
                    {a.status === 'ACTIVE' && <button className="adm-btn small danger" onClick={async () => (await confirm({ title: t('disable'), text: a.email, danger: true })) && act(`admins/${a.id}`, { status: 'DISABLED' })}>{t('disable')}</button>}
                    {a.status === 'DISABLED' && <button className="adm-btn small" onClick={() => act(`admins/${a.id}`, { status: 'ACTIVE' })}>{t('enable')}</button>}
                    <button className="adm-btn small" onClick={async () => (await confirm({ title: t('resetAccess'), text: t('resetAccessConfirm'), danger: true })) && act(`admins/${a.id}/reset`, {})}><KeyRound size={13} /> {t('resetAccess')}</button>
                    {a.sessions > 0 && <button className="adm-btn small" onClick={() => act(`admins/${a.id}/sessions/revoke`, {})}>{t('revokeSessions')}</button>}
                  </div>
                ),
            },
          ]}
        />
      )}
      {inviting && (
        <InviteDialog
          onClose={() => setInviting(false)}
          onInvited={(url) => {
            setInviting(false);
            setLink(url);
            void reload();
          }}
        />
      )}
      {link && <InviteLink url={link} onClose={() => setLink(null)} />}
    </>
  );
}

function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: (url: string) => void }) {
  const { t, api, fail } = useAdmin();
  const [form, setForm] = useState({ email: '', name: '', role: 'SUPPORT_ADMIN' }),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={t('inviteAdmin')}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn" onClick={onClose}>{t('cancel')}</button>
          <button
            className="adm-btn primary"
            disabled={busy || !form.email.includes('@') || form.name.length < 2}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api<{ inviteUrl: string }>('admins', form);
                onInvited(r.inviteUrl);
              } catch (e) {
                fail(e);
                setBusy(false);
              }
            }}
          >
            {t('inviteAdmin')}
          </button>
        </>
      }
    >
      <div className="adm-form">
        <Field label={t('email')}><input type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label={t('name')}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label={t('role')}>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{t(r)}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function InviteLink({ url, onClose }: { url: string; onClose: () => void }) {
  const { t, toast } = useAdmin();
  return (
    <Modal title={t('inviteLink')} onClose={onClose} footer={<button className="adm-btn primary" onClick={onClose}>{t('close')}</button>}>
      <div className="adm-form">
        <Notice kind="warn">{t('inviteHint')}</Notice>
        <div className="adm-row">
          <input readOnly className="adm-mono" value={url} onFocus={(e) => e.target.select()} style={{ flex: 1 }} />
          <button className="adm-btn" onClick={() => navigator.clipboard.writeText(url).then(() => toast(t('copied')))}><Copy size={14} /> {t('copy')}</button>
        </div>
      </div>
    </Modal>
  );
}

type AuditRow = { id: string; adminId: string; adminEmail: string; action: string; resourceType: string; resourceId: string | null; details: string; result: string; createdAt: string };

export function AuditSection() {
  const { t, formatDate, exportCsv } = useAdmin();
  const [range, setRange] = useDateRange(30);
  const [filters, setFilters] = useState({ adminId: '', action: '', resourceType: '', result: '', page: '1' }),
    [open, setOpen] = useState<AuditRow | null>(null);
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), from: range.from, to: range.to }).toString();
  const { data, error, reload } = useLoad<{ items: AuditRow[]; total: number; page: number; pageSize: number; admins: { id: string; email: string }[] }>(`audit?${qs}`, [qs]);
  const set = (patch: Partial<typeof filters>) => setFilters({ ...filters, page: '1', ...patch });
  return (
    <>
      <PageHead title={t('navAudit')} subtitle={t('auditSub')}>
        <button className="adm-btn" onClick={() => exportCsv(`audit/export?${qs.replace(/(^|&)page=\d+/, '')}`)}><Download size={15} /> {t('export')}</button>
      </PageHead>
      <div className="adm-toolbar">
        <DateRange value={range} onChange={setRange} />
        <select aria-label={t('administrator')} value={filters.adminId} onChange={(e) => set({ adminId: e.target.value })}>
          <option value="">{t('administrator')}: {t('all')}</option>
          {data?.admins.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
        </select>
        <input placeholder={t('action')} value={filters.action} onChange={(e) => set({ action: e.target.value })} style={{ width: 160 }} />
        <select aria-label={t('resource')} value={filters.resourceType} onChange={(e) => set({ resourceType: e.target.value })}>
          <option value="">{t('resource')}: {t('all')}</option>
          {['admin', 'users', 'coaches', 'billing', 'ai', 'ads', 'content', 'announcements', 'config', 'tickets', 'system', 'admins', 'audit'].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select aria-label={t('result')} value={filters.result} onChange={(e) => set({ result: e.target.value })}>
          <option value="">{t('result')}: {t('all')}</option>
          {['SUCCESS', 'FAILURE', 'DENIED'].map((r) => <option key={r} value={r}>{t(r)}</option>)}
        </select>
      </div>
      {error && <ErrorState code={error} onRetry={() => void reload()} />}
      {!data ? (
        <LoadingBlock rows={8} />
      ) : (
        <>
          <Table
            rows={data.items}
            onRowClick={setOpen}
            columns={[
              { key: 't', label: t('time'), render: (r) => formatDate(r.createdAt, true) },
              { key: 'a', label: t('administrator'), render: (r) => r.adminEmail || <span className="adm-muted">{r.adminId}</span> },
              { key: 'x', label: t('action'), render: (r) => <span className="adm-mono">{r.action}</span> },
              { key: 'r', label: t('resource'), render: (r) => <span className="adm-mono">{r.resourceType}{r.resourceId ? ` · ${r.resourceId.slice(0, 14)}` : ''}</span> },
              { key: 's', label: t('result'), render: (r) => <Badge value={r.result} /> },
            ]}
          />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setFilters({ ...filters, page: String(page) })} />
        </>
      )}
      {open && (
        <Modal title={open.action} onClose={() => setOpen(null)}>
          <dl className="adm-kv">
            <dt>{t('time')}</dt>
            <dd>{formatDate(open.createdAt, true)}</dd>
            <dt>{t('administrator')}</dt>
            <dd>{open.adminEmail} <span className="adm-mono adm-muted">{open.adminId}</span></dd>
            <dt>{t('resource')}</dt>
            <dd className="adm-mono">{open.resourceType} {open.resourceId}</dd>
            <dt>{t('result')}</dt>
            <dd><Badge value={open.result} /></dd>
          </dl>
          <pre className="adm-mono adm-msg" style={{ marginTop: 12, maxHeight: 320, overflow: 'auto' }}>{(() => { try { return JSON.stringify(JSON.parse(open.details), null, 2); } catch { return open.details; } })()}</pre>
        </Modal>
      )}
    </>
  );
}

export function AccountSection() {
  const { t, me, api, toast, fail } = useAdmin();
  const [current, setCurrent] = useState(''),
    [next, setNext] = useState(''),
    [codes, setCodes] = useState<string[] | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <>
      <PageHead title={t('navAccount')} subtitle={t('accountSub')} />
      <div className="adm-grid two">
        <Card title={me.name}>
          <dl className="adm-kv">
            <dt>{t('email')}</dt>
            <dd>{me.email}</dd>
            <dt>{t('role')}</dt>
            <dd>{t(me.role)}</dd>
            <dt>{t('permissions')}</dt>
            <dd>
              <div className="adm-row">{me.permissions.map((p) => <span key={p} className="adm-badge adm-mono">{p}</span>)}</div>
            </dd>
          </dl>
        </Card>
        <div className="adm-stack">
          <Card title={t('changePassword')}>
            <form
              className="adm-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api('auth/password', { current, next });
                  setCurrent('');
                  setNext('');
                  toast(t('passwordChanged'));
                } catch (err) {
                  fail(err);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label={t('currentPassword')}><input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
              <Field label={t('newPassword')} hint={t('passwordRule')}><input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
              <div><button className="adm-btn primary" disabled={busy || !current || next.length < 14}>{t('changePassword')}</button></div>
            </form>
          </Card>
          <Card title={t('recoveryTitle')}>
            <p className="adm-muted" style={{ marginTop: 0 }}>{t('recoveryText')}</p>
            {codes ? (
              <div className="adm-codes adm-mono">{codes.map((c) => <span key={c}>{c}</span>)}</div>
            ) : (
              <button
                className="adm-btn"
                onClick={async () => {
                  try {
                    setCodes((await api<{ recoveryCodes: string[] }>('auth/recovery-codes', {})).recoveryCodes);
                  } catch (e) {
                    fail(e);
                  }
                }}
              >
                {t('newRecoveryCodes')}
              </button>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
