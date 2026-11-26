'use client';
import { useEffect, useState } from 'react';
import { Bot, CheckCircle2, CircleAlert, Plug, Plus } from 'lucide-react';
import {
  Badge,
  Card,
  DateRange,
  ErrorState,
  Field,
  LoadingBlock,
  Modal,
  Notice,
  PageHead,
  Pagination,
  Stat,
  StatsSkeleton,
  Switch,
  Table,
  useAdmin,
  useDateRange,
  useLoad,
} from './ui';
import { TimeChart } from './charts';

type TierFeatures = { ads: boolean; ai: boolean };
type Plans = {
  pricesUsd: { PREMIUM: number; COACH: number };
  stripePriceIds: { PREMIUM: string; COACH: string };
  coachClientLimit: number;
  coachClientsGetAi: boolean;
  tiers: { FREE: TierFeatures; PREMIUM: TierFeatures; COACH: TierFeatures };
};
type Promotion = { id: string; code: string; kind: string; days: number; maxRedemptions: number | null; redemptions: number; audience: string; endsAt: string | null; active: boolean; createdAt: string };
type BillingData = {
  configured: boolean;
  plans: Plans;
  subscriptions: { tier: string; status: string; count: number }[];
  payments: { items: { id: string; amount: number; currency: string; status: string; createdAt: string; user: { id: string; name: string } }[]; total: number; page: number; pageSize: number };
  promotions: Promotion[];
  grants: { kind: string; source: string; count: number }[];
  cancelling: { tier: string; currentPeriodEnd: string | null; user: { id: string; name: string } }[];
};

export function BillingSection() {
  const { t, can, api, toast, fail, confirm, formatMoney, formatDate, formatNumber, navigate } = useAdmin();
  const [page, setPage] = useState(1);
  const { data, error, reload } = useLoad<BillingData>(`billing?page=${page}`, [page]);
  const [plans, setPlans] = useState<Plans | null>(null),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [promoOpen, setPromoOpen] = useState(false);
  useEffect(() => {
    if (data && !plans) setPlans(data.plans);
  }, [data, plans]);
  const manage = can('billing.manage');
  if (error) return <ErrorState code={error} onRetry={() => void reload()} />;
  if (!data || !plans) return <><PageHead title={t('navBilling')} subtitle={t('billingSub')} /><StatsSkeleton count={4} /></>;
  const count = (tier: string, status = 'ACTIVE') => data.subscriptions.filter((s) => s.tier === tier && s.status === status).reduce((n, s) => n + s.count, 0);
  const setTier = (tier: keyof Plans['tiers'], key: keyof TierFeatures, value: boolean) => setPlans({ ...plans, tiers: { ...plans.tiers, [tier]: { ...plans.tiers[tier], [key]: value } } });
  return (
    <>
      <PageHead title={t('navBilling')} subtitle={t('billingSub')} />
      {!data.configured && <Notice kind="warn">{t('billingOff')}</Notice>}
      <Notice>{t('storeNotice')}</Notice>
      <div className="adm-grid stats" style={{ marginBottom: 16 }}>
        <Stat label={t('premiumSubscribers')} value={formatNumber(count('PREMIUM'))} />
        <Stat label={t('coachSubscribers')} value={formatNumber(count('COACH'))} />
        <Stat label={t('mrr')} hint={t('mrrHint')} value={formatMoney(count('PREMIUM') * plans.pricesUsd.PREMIUM + count('COACH') * plans.pricesUsd.COACH)} />
        <Stat label={t('activeGrants')} value={formatNumber(data.grants.reduce((n, g) => n + g.count, 0))} foot={<span className="adm-stat-foot">{data.grants.map((g) => `${t(g.kind)} ${g.count}`).join(' · ') || '—'}</span>} />
      </div>
      <div className="adm-grid two">
        <Card title={t('plansAndPrices')}>
          <div className="adm-form cols">
            {(['PREMIUM', 'COACH'] as const).map((tier) => (
              <div key={tier} className="adm-stack" style={{ gap: 8 }}>
                <strong>{t(tier)}</strong>
                <Field label={t('displayPrice')}>
                  <input type="number" min={0} step="0.01" disabled={!manage} value={plans.pricesUsd[tier]} onChange={(e) => setPlans({ ...plans, pricesUsd: { ...plans.pricesUsd, [tier]: Number(e.target.value) } })} />
                </Field>
                <Field label={t('stripePrice')}>
                  <input className="adm-mono" disabled={!manage} placeholder="price_…" value={plans.stripePriceIds[tier]} onChange={(e) => setPlans({ ...plans, stripePriceIds: { ...plans.stripePriceIds, [tier]: e.target.value.trim() } })} />
                </Field>
              </div>
            ))}
            <Field label={t('defaultClientLimit')}>
              <input type="number" min={0} max={1000} disabled={!manage} value={plans.coachClientLimit} onChange={(e) => setPlans({ ...plans, coachClientLimit: Number(e.target.value) })} />
            </Field>
          </div>
          <h3 style={{ marginTop: 16 }}>{t('tierFeatures')}</h3>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>{t('plan')}</th>
                  <th>{t('ads')}</th>
                  <th>AI</th>
                </tr>
              </thead>
              <tbody>
                {(['FREE', 'PREMIUM', 'COACH'] as const).map((tier) => (
                  <tr key={tier}>
                    <td>{t(tier)}</td>
                    <td><Switch label="" checked={plans.tiers[tier].ads} disabled={!manage} onChange={(v) => setTier(tier, 'ads', v)} /></td>
                    <td><Switch label="" checked={plans.tiers[tier].ai} disabled={!manage} onChange={(v) => setTier(tier, 'ai', v)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12 }}>
            <Switch label={t('coachClientsAi')} checked={plans.coachClientsGetAi} disabled={!manage} onChange={(v) => setPlans({ ...plans, coachClientsGetAi: v })} />
          </div>
          {manage && (
            <div className="adm-row" style={{ marginTop: 16 }}>
              <input placeholder={t('changeNote')} value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
              <button
                className="adm-btn primary"
                disabled={busy}
                onClick={async () => {
                  if (!(await confirm({ title: t('publish'), text: t('publishConfirm') }))) return;
                  setBusy(true);
                  try {
                    await api('billing/plans', { plans, note });
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
          )}
        </Card>
        <div className="adm-stack">
          <Card title={t('promotions')} actions={manage && <button className="adm-btn small primary" onClick={() => setPromoOpen(true)}><Plus size={14} /> {t('newPromotion')}</button>}>
            <Table
              rows={data.promotions}
              columns={[
                { key: 'code', label: t('promoCode'), render: (p) => <span className="adm-mono">{p.code}</span> },
                { key: 'kind', label: t('grantKind'), render: (p) => `${t(p.kind)} · ${p.days} ${t('days').toLowerCase()}` },
                { key: 'red', label: t('redemptions'), className: 'num', render: (p) => `${formatNumber(p.redemptions)} / ${p.maxRedemptions ?? '∞'}` },
                { key: 'end', label: t('endsOn'), render: (p) => (p.endsAt ? formatDate(p.endsAt) : '—') },
                {
                  key: 'active',
                  label: t('status'),
                  render: (p) => (
                    <Switch
                      label={t(p.active ? 'active' : 'inactive')}
                      checked={p.active}
                      disabled={!manage}
                      onChange={async (active) => {
                        try {
                          await api(`billing/promotions/${p.id}`, { active });
                          await reload();
                        } catch (e) {
                          fail(e);
                        }
                      }}
                    />
                  ),
                },
              ]}
            />
          </Card>
          <Card title={t('pendingCancellations')}>
            {data.cancelling.length ? (
              <div className="adm-list">
                {data.cancelling.map((c) => (
                  <div key={c.user.id}>
                    <button className="adm-btn ghost small" style={{ flex: 1, justifyContent: 'flex-start' }} onClick={() => navigate('users', { user: c.user.id })}>{c.user.name}</button>
                    <Badge value={c.tier} />
                    <span className="adm-small adm-muted">{formatDate(c.currentPeriodEnd)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="adm-muted" style={{ margin: 0 }}>—</p>
            )}
          </Card>
        </div>
      </div>
      <Card title={t('recentPayments')} className="adm-space-top">
        <Table
          rows={data.payments.items}
          columns={[
            { key: 'date', label: t('created'), render: (p) => formatDate(p.createdAt, true) },
            { key: 'user', label: t('USER'), render: (p) => p.user.name },
            { key: 'amount', label: t('amount'), className: 'num', render: (p) => formatMoney(p.amount / 100, p.currency) },
            { key: 'status', label: t('status'), render: (p) => <Badge label={p.status} kind={p.status === 'paid' ? 'green' : 'amber'} /> },
          ]}
        />
        <Pagination page={data.payments.page} pageSize={data.payments.pageSize} total={data.payments.total} onPage={setPage} />
      </Card>
      {promoOpen && <PromotionDialog onClose={() => setPromoOpen(false)} onSaved={() => { setPromoOpen(false); void reload(); }} />}
    </>
  );
}

function PromotionDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t, api, toast, fail } = useAdmin();
  const [form, setForm] = useState({ code: '', kind: 'PREMIUM', days: '30', maxRedemptions: '', audience: 'ALL', endsAt: '' }),
    [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  return (
    <Modal
      title={t('newPromotion')}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn" onClick={onClose}>{t('cancel')}</button>
          <button
            className="adm-btn primary"
            disabled={busy || form.code.length < 4}
            onClick={async () => {
              setBusy(true);
              try {
                await api('billing/promotions', { code: form.code, kind: form.kind, days: Number(form.days), maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null, audience: form.audience, endsAt: form.endsAt || null });
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
      <div className="adm-form cols">
        <Field label={t('promoCode')}>
          <input className="adm-mono" value={form.code} maxLength={32} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} />
        </Field>
        <Field label={t('grantKind')}>
          <select value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="PREMIUM">{t('PREMIUM')}</option>
            <option value="AD_FREE">{t('AD_FREE')}</option>
          </select>
        </Field>
        <Field label={t('days')}>
          <input type="number" min={1} max={365} value={form.days} onChange={(e) => set({ days: e.target.value })} />
        </Field>
        <Field label={t('maxRedemptions')} hint={t('unlimited') + ': —'}>
          <input type="number" min={1} value={form.maxRedemptions} onChange={(e) => set({ maxRedemptions: e.target.value })} />
        </Field>
        <Field label={t('audience')}>
          <select value={form.audience} onChange={(e) => set({ audience: e.target.value })}>
            <option value="ALL">{t('ALL')}</option>
            <option value="INDEPENDENT">{t('INDEPENDENT')}</option>
            <option value="COACH">{t('COACH')}</option>
          </select>
        </Field>
        <Field label={t('endsOn')}>
          <input type="date" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

type AiSettings = { enabled: boolean; features: Record<'chat' | 'photo' | 'plan' | 'copilot', boolean>; defaultProvider: string; fallbackProviders: string[]; monthlyBudgetUsd: number; globalMonthlyRequests: number; perUserMonthlyRequests: number };
type Provider = { id: string; name: string; baseUrl: string; configured: boolean; keyHint: string; enabled: boolean; textModel: string; visionModel: string; inputCostPerM: number; outputCostPerM: number; suggestedModel: string; lastCheckedAt: string | null; lastStatus: string };
type AiData = {
  settings: AiSettings;
  providers: Provider[];
  environment: { configured: boolean; model: string; fallbacks: string; baseUrl: string };
  month: { costUsd: number; requests: number };
  byModel: { provider: string; model: string; requests: number; promptTokens: number; completionTokens: number; costUsd: number; avgLatencyMs: number }[];
  byFeature: { feature: string; requests: number; costUsd: number }[];
  failures: { provider: string; error: string | null; count: number }[];
  topUsers: { userId: string; name: string; requests: number; costUsd: number }[];
  series: { date: string; requests: number; failures: number; tokens: number; costUsd: number }[];
};

export function AiSection() {
  const { t, can, api, toast, fail, formatMoney, formatNumber } = useAdmin();
  const [range, setRange] = useDateRange(30);
  const { data, error, reload } = useLoad<AiData>(`ai?from=${range.from}&to=${range.to}`, [range.from, range.to]);
  const [settings, setSettings] = useState<AiSettings | null>(null),
    [editing, setEditing] = useState<Provider | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data && !settings) setSettings(data.settings);
  }, [data, settings]);
  const manage = can('ai.manage');
  if (error) return <ErrorState code={error} onRetry={() => void reload()} />;
  const featureLabel: Record<string, string> = { chat: 'featureChat', photo: 'featurePhoto', plan: 'featurePlan', copilot: 'featureCopilot' };
  const budgetUsed = data && settings?.monthlyBudgetUsd ? Math.min(100, (data.month.costUsd / settings.monthlyBudgetUsd) * 100) : null;
  return (
    <>
      <PageHead title={t('navAi')} subtitle={t('aiSub')}>
        <DateRange value={range} onChange={setRange} />
      </PageHead>
      {!data || !settings ? (
        <StatsSkeleton count={4} />
      ) : (
        <div className="adm-stack">
          <div className="adm-grid stats">
            <Stat label={`${t('aiCost')} · ${t('thisMonth')}`} icon={<Bot size={15} />} value={formatMoney(data.month.costUsd)} foot={budgetUsed != null ? <span className="adm-stat-foot">{formatNumber(budgetUsed, 1)}% / {formatMoney(settings.monthlyBudgetUsd)}</span> : undefined} />
            <Stat label={`${t('aiRequests')} · ${t('thisMonth')}`} value={formatNumber(data.month.requests)} />
            <Stat label={t('aiRequests')} value={formatNumber(data.series.reduce((n, s) => n + s.requests, 0))} foot={<span className="adm-stat-foot">{formatNumber(data.series.reduce((n, s) => n + s.failures, 0))} {t('failures').toLowerCase()}</span>} />
            <Stat label={t('aiTokens')} value={formatNumber(data.series.reduce((n, s) => n + s.tokens, 0))} />
          </div>
          <Card title={t('aiRequests')}>
            <TimeChart data={data.series} xKey="date" series={[{ key: 'requests', label: t('requests'), color: 'var(--chart-1)' }, { key: 'failures', label: t('failures'), color: 'var(--chart-5)', kind: 'bar' }, { key: 'costUsd', label: t('cost'), color: 'var(--chart-4)', axis: 'right' }]} />
          </Card>
          <div className="adm-grid two">
            <Card title={t('aiEnabled')}>
              <div className="adm-form">
                <Switch label={t('aiEnabled')} checked={settings.enabled} disabled={!manage} onChange={(enabled) => setSettings({ ...settings, enabled })} />
                {(Object.keys(settings.features) as (keyof AiSettings['features'])[]).map((f) => (
                  <Switch key={f} label={t(featureLabel[f])} checked={settings.features[f]} disabled={!manage || !settings.enabled} onChange={(v) => setSettings({ ...settings, features: { ...settings.features, [f]: v } })} />
                ))}
                <Field label={t('defaultProvider')}>
                  <select value={settings.defaultProvider} disabled={!manage} onChange={(e) => setSettings({ ...settings, defaultProvider: e.target.value })}>
                    <option value="">{t('envProvider')}</option>
                    {data.providers.map((p) => (
                      <option key={p.id} value={p.id} disabled={!p.enabled}>
                        {p.name} {!p.enabled ? `(${t('off')})` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('fallbackProviders')}>
                  <div className="adm-row">
                    {data.providers.filter((p) => p.id !== settings.defaultProvider).map((p) => (
                      <Switch key={p.id} label={p.name} disabled={!manage || !p.enabled} checked={settings.fallbackProviders.includes(p.id)} onChange={(v) => setSettings({ ...settings, fallbackProviders: v ? [...settings.fallbackProviders, p.id] : settings.fallbackProviders.filter((x) => x !== p.id) })} />
                    ))}
                  </div>
                </Field>
                <div className="adm-form cols">
                  <Field label={t('monthlyBudget')}><input type="number" min={0} disabled={!manage} value={settings.monthlyBudgetUsd} onChange={(e) => setSettings({ ...settings, monthlyBudgetUsd: Number(e.target.value) })} /></Field>
                  <Field label={t('globalLimit')}><input type="number" min={0} disabled={!manage} value={settings.globalMonthlyRequests} onChange={(e) => setSettings({ ...settings, globalMonthlyRequests: Number(e.target.value) })} /></Field>
                  <Field label={t('perUserLimit')}><input type="number" min={0} disabled={!manage} value={settings.perUserMonthlyRequests} onChange={(e) => setSettings({ ...settings, perUserMonthlyRequests: Number(e.target.value) })} /></Field>
                </div>
                {manage && (
                  <div>
                    <button
                      className="adm-btn primary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api('ai/settings', { ai: settings });
                          toast(t('saved'));
                          await reload();
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
                )}
              </div>
            </Card>
            <Card title={t('providers')}>
              {!settings.defaultProvider && (
                <Notice>
                  {t('envProvider')}: {data.environment.configured ? `${data.environment.baseUrl} · ${data.environment.model}${data.environment.fallbacks ? ' → ' + data.environment.fallbacks : ''}` : t('off')}
                </Notice>
              )}
              <div className="adm-list">
                {data.providers.map((p) => (
                  <div key={p.id}>
                    <Plug size={16} />
                    <span style={{ flex: 1 }}>
                      <span className="adm-cell-main">{p.name}</span>
                      <div className="adm-cell-sub">
                        {p.configured ? <span className="adm-mono">{p.keyHint}</span> : t('none')} {p.textModel && `· ${p.textModel}`}
                      </div>
                    </span>
                    {p.lastStatus === 'ok' ? <Badge kind="green" label={<><CheckCircle2 size={12} /> {t('available')}</>} /> : p.lastStatus === 'unknown' ? <Badge label={t('unknown')} /> : <Badge kind="red" label={<><CircleAlert size={12} /> {p.lastStatus}</>} />}
                    <Badge kind={p.enabled ? 'green' : ''} label={t(p.enabled ? 'on' : 'off')} />
                    {manage && (
                      <button className="adm-btn small" onClick={() => setEditing(p)}>
                        {t('edit')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
          <div className="adm-grid two">
            <Card title={t('usageByModel')}>
              <Table
                rows={data.byModel}
                rowKey={(r) => r.provider + r.model}
                columns={[
                  { key: 'm', label: t('model'), render: (r) => (<><div className="adm-cell-main adm-mono">{r.model}</div><div className="adm-cell-sub">{r.provider}</div></>) },
                  { key: 'r', label: t('requests'), className: 'num', render: (r) => formatNumber(r.requests) },
                  { key: 'tok', label: t('aiTokens'), className: 'num', render: (r) => formatNumber(r.promptTokens + r.completionTokens) },
                  { key: 'c', label: t('cost'), className: 'num', render: (r) => formatMoney(r.costUsd) },
                  { key: 'l', label: t('latency'), className: 'num', render: (r) => `${formatNumber(r.avgLatencyMs)} ms` },
                ]}
              />
            </Card>
            <Card title={t('usageByFeature')}>
              <Table rows={data.byFeature} rowKey={(r) => r.feature} columns={[{ key: 'f', label: t('feature'), render: (r) => t(featureLabel[r.feature] ?? r.feature) }, { key: 'r', label: t('requests'), className: 'num', render: (r) => formatNumber(r.requests) }, { key: 'c', label: t('cost'), className: 'num', render: (r) => formatMoney(r.costUsd) }]} />
            </Card>
            <Card title={t('failures')}>
              <Table rows={data.failures} rowKey={(r, i) => r.provider + i} columns={[{ key: 'p', label: t('provider'), render: (r) => r.provider }, { key: 'e', label: t('error'), render: (r) => <span className="adm-mono">{r.error ?? '—'}</span> }, { key: 'n', label: t('count'), className: 'num', render: (r) => formatNumber(r.count) }]} />
            </Card>
            <Card title={t('topUsers')}>
              <Table rows={data.topUsers} rowKey={(r) => r.userId} columns={[{ key: 'n', label: t('name'), render: (r) => r.name }, { key: 'r', label: t('requests'), className: 'num', render: (r) => formatNumber(r.requests) }, { key: 'c', label: t('cost'), className: 'num', render: (r) => formatMoney(r.costUsd) }]} />
            </Card>
          </div>
        </div>
      )}
      {editing && <ProviderDialog provider={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
    </>
  );
}

function ProviderDialog({ provider, onClose, onSaved }: { provider: Provider; onClose: () => void; onSaved: () => void }) {
  const { t, api, toast, fail } = useAdmin();
  const [form, setForm] = useState({ enabled: provider.enabled, textModel: provider.textModel || provider.suggestedModel, visionModel: provider.visionModel, inputCostPerM: provider.inputCostPerM, outputCostPerM: provider.outputCostPerM, apiKey: '', clearKey: false }),
    [busy, setBusy] = useState(false),
    [probe, setProbe] = useState<string | null>(null);
  return (
    <Modal
      title={provider.name}
      onClose={onClose}
      footer={
        <>
          <button
            className="adm-btn"
            disabled={busy || !provider.configured}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api<{ ok: boolean; status: string; latencyMs: number }>(`ai/providers/${provider.id}/test`, {});
                setProbe(r.ok ? `${t('available')} · ${r.latencyMs} ms` : `${t('unavailable')} · ${r.status}`);
              } catch (e) {
                fail(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('testConnection')}
          </button>
          <button className="adm-btn" onClick={onClose}>{t('cancel')}</button>
          <button
            className="adm-btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`ai/providers/${provider.id}`, { ...form, apiKey: form.apiKey || undefined });
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
        <p className="adm-muted adm-mono" style={{ margin: 0 }}>{provider.baseUrl}</p>
        <Switch label={t('on')} checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} />
        <Field label={t('apiKey')} hint={provider.configured ? `${t('keySaved')}: ${provider.keyHint}` : undefined}>
          <input type="password" autoComplete="off" placeholder={provider.configured ? t('keyReplace') : ''} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value, clearKey: false })} />
        </Field>
        {provider.configured && <Switch label={t('clearKey')} checked={form.clearKey} onChange={(clearKey) => setForm({ ...form, clearKey, apiKey: '' })} />}
        <Field label={t('textModel')} hint={`${provider.suggestedModel}, …`}>
          <input className="adm-mono" value={form.textModel} onChange={(e) => setForm({ ...form, textModel: e.target.value })} />
        </Field>
        <Field label={t('visionModel')}>
          <input className="adm-mono" value={form.visionModel} onChange={(e) => setForm({ ...form, visionModel: e.target.value })} />
        </Field>
        <div className="adm-form cols">
          <Field label={t('inputCost')}><input type="number" min={0} step="0.01" value={form.inputCostPerM} onChange={(e) => setForm({ ...form, inputCostPerM: Number(e.target.value) })} /></Field>
          <Field label={t('outputCost')}><input type="number" min={0} step="0.01" value={form.outputCostPerM} onChange={(e) => setForm({ ...form, outputCostPerM: Number(e.target.value) })} /></Field>
        </div>
        {probe && <Notice>{probe}</Notice>}
      </div>
    </Modal>
  );
}

type AdSettings = { enabled: boolean; placements: Record<string, boolean>; minIntervalSeconds: number; maxImpressionsPerDay: number; excludeCoachClients: boolean; excludeMinors: true; nonPersonalizedOnly: boolean };
type AdsData = {
  settings: AdSettings;
  byPlacement: Record<string, { impressions: number; clicks: number }>;
  series: { date: string; impressions: number; clicks: number }[];
  revenue: { id: string; month: string; network: string; amountCents: number; currency: string; note: string }[];
  eligibility: { freeIndependent: number; coachedExcluded: number; grantExcluded: number };
};

export function AdsSection() {
  const { t, can, api, toast, fail, formatNumber, formatMoney } = useAdmin();
  const [range, setRange] = useDateRange(30);
  const { data, error, reload } = useLoad<AdsData>(`ads?from=${range.from}&to=${range.to}`, [range.from, range.to]);
  const [settings, setSettings] = useState<AdSettings | null>(null),
    [revenue, setRevenue] = useState({ month: new Date().toISOString().slice(0, 7), network: 'admob', amount: '', note: '' }),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data && !settings) setSettings(data.settings);
  }, [data, settings]);
  const manage = can('ads.manage');
  if (error) return <ErrorState code={error} onRetry={() => void reload()} />;
  return (
    <>
      <PageHead title={t('navAds')} subtitle={t('adsSub')}>
        <DateRange value={range} onChange={setRange} />
      </PageHead>
      {!data || !settings ? (
        <LoadingBlock rows={6} />
      ) : (
        <div className="adm-stack">
          <div className="adm-grid stats">
            <Stat label={t('impressions')} value={formatNumber(data.series.reduce((n, s) => n + s.impressions, 0))} />
            <Stat label={t('clicks')} value={formatNumber(data.series.reduce((n, s) => n + s.clicks, 0))} />
            <Stat label={t('eligibleUpperBound')} value={formatNumber(data.eligibility.freeIndependent)} />
            <Stat label={t('excludedCoached')} value={formatNumber(data.eligibility.coachedExcluded)} foot={<span className="adm-stat-foot">{t('excludedGrants')}: {formatNumber(data.eligibility.grantExcluded)}</span>} />
          </div>
          <Card title={t('impressions')}>
            <TimeChart data={data.series} xKey="date" series={[{ key: 'impressions', label: t('impressions'), color: 'var(--chart-1)' }, { key: 'clicks', label: t('clicks'), color: 'var(--chart-3)', kind: 'bar', axis: 'right' }]} />
          </Card>
          <div className="adm-grid two">
            <Card title={t('placements')}>
              <div className="adm-form">
                <Switch label={t('adsEnabled')} checked={settings.enabled} disabled={!manage} onChange={(enabled) => setSettings({ ...settings, enabled })} />
                {Object.keys(settings.placements).map((p) => (
                  <div className="adm-spread" key={p}>
                    <Switch label={t('placement_' + p)} checked={settings.placements[p]} disabled={!manage || !settings.enabled} onChange={(v) => setSettings({ ...settings, placements: { ...settings.placements, [p]: v } })} />
                    <span className="adm-small adm-muted">{formatNumber(data.byPlacement[p]?.impressions ?? 0)} {t('impressions').toLowerCase()}</span>
                  </div>
                ))}
                <div className="adm-form cols">
                  <Field label={t('minInterval')}><input type="number" min={0} disabled={!manage} value={settings.minIntervalSeconds} onChange={(e) => setSettings({ ...settings, minIntervalSeconds: Number(e.target.value) })} /></Field>
                  <Field label={t('maxPerDay')}><input type="number" min={0} disabled={!manage} value={settings.maxImpressionsPerDay} onChange={(e) => setSettings({ ...settings, maxImpressionsPerDay: Number(e.target.value) })} /></Field>
                </div>
                <h3>{t('eligibility')}</h3>
                <Switch label={t('excludeCoachClients')} checked={settings.excludeCoachClients} disabled={!manage} onChange={(v) => setSettings({ ...settings, excludeCoachClients: v })} />
                <Switch label={t('excludeMinors')} checked disabled onChange={() => {}} />
                <Switch label={t('nonPersonalized')} checked={settings.nonPersonalizedOnly} disabled={!manage} onChange={(v) => setSettings({ ...settings, nonPersonalizedOnly: v })} />
                {manage && (
                  <div>
                    <button
                      className="adm-btn primary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api('ads/settings', { ads: settings });
                          toast(t('saved'));
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
                )}
              </div>
            </Card>
            <Card title={t('revenueEntries')}>
              <p className="adm-muted adm-small" style={{ marginTop: 0 }}>{t('revenueHint')}</p>
              {manage && (
                <div className="adm-form cols" style={{ marginBottom: 12 }}>
                  <Field label={t('month')}><input type="month" value={revenue.month} onChange={(e) => setRevenue({ ...revenue, month: e.target.value })} /></Field>
                  <Field label={t('network')}>
                    <select value={revenue.network} onChange={(e) => setRevenue({ ...revenue, network: e.target.value })}>
                      <option value="admob">AdMob</option>
                      <option value="adsense">AdSense</option>
                      <option value="other">Other</option>
                    </select>
                  </Field>
                  <Field label={`${t('amount')} (USD)`}><input type="number" min={0} step="0.01" value={revenue.amount} onChange={(e) => setRevenue({ ...revenue, amount: e.target.value })} /></Field>
                  <div className="adm-field" style={{ justifyContent: 'flex-end' }}>
                    <button
                      className="adm-btn primary"
                      disabled={!revenue.amount}
                      onClick={async () => {
                        try {
                          await api('ads/revenue', { month: revenue.month, network: revenue.network, amountCents: Math.round(Number(revenue.amount) * 100), note: revenue.note });
                          toast(t('saved'));
                          setRevenue({ ...revenue, amount: '' });
                          await reload();
                        } catch (e) {
                          fail(e);
                        }
                      }}
                    >
                      {t('save')}
                    </button>
                  </div>
                </div>
              )}
              <Table rows={data.revenue} columns={[{ key: 'm', label: t('month'), render: (r) => r.month }, { key: 'n', label: t('network'), render: (r) => r.network }, { key: 'a', label: t('amount'), className: 'num', render: (r) => formatMoney(r.amountCents / 100, r.currency) }]} />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
