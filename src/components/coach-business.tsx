'use client';
import { useEffect, useState } from 'react';
import { monthlyBusiness, remainingSessions, type BusinessPackage } from '@/lib/coach-business';
import { api, Empty, Form, Modal, PageHeading, Submit, useNutri } from './workspace';
import { LoadingCards } from './loading-cards';

export function CoachBusiness({
  view,
}: {
  view: 'packages' | 'trainingLog' | 'clientPayments' | 'businessReports';
}) {
  const { state, t, lang, date, refresh } = useNutri();
  const [packages, setPackages] = useState<BusinessPackage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(date.slice(0, 7));
  const [client, setClient] = useState('');
  const [modal, setModal] = useState<'package' | 'training' | 'receipt' | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const links = state.relationships.filter(
    (r) => r.coachId === state.user.id && r.status === 'ACTIVE',
  );
  const money = (amount: number) =>
    new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
      style: 'currency',
      currency: 'ILS',
    }).format(amount / 100);
  async function load() {
    const result = await api<{ packages: BusinessPackage[] }>('coach-business');
    setPackages(result.packages);
    setLoaded(true);
    setError('');
  }
  useEffect(() => {
    let active = true;
    api<{ packages: BusinessPackage[] }>('coach-business')
      .then((result) => {
        if (active) {
          setPackages(result.packages);
          setLoaded(true);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [view, state.clockAt]);
  async function save(body: unknown) {
    await api('coach-business', body);
    setModal(null);
    const results = await Promise.allSettled([load(), refresh()]);
    if (results.some((result) => result.status === 'rejected')) setError('savedRefreshPending');
  }
  async function change(body: unknown) {
    if (busy) return;
    setBusy(true);
    try {
      await save(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered = packages.filter((p) => !client || p.relationship.client.id === client);
  const report = monthlyBusiness(filtered, month);
  const options = packages.filter((p) => p.relationship.status === 'ACTIVE');
  const current = packages.find((p) => p.id === selected);
  const statusLabel = (status: string) =>
    t(
      status === 'COMPLETED'
        ? 'workoutDone'
        : status === 'CANCELLED'
          ? 'businessCancelled'
          : 'businessPlanned',
    );
  function open(kind: 'package' | 'training' | 'receipt', packageId = '') {
    setSelected(packageId || options[0]?.id || '');
    setModal(kind);
  }
  const sessions = filtered
    .flatMap((p) => p.sessions.map((s) => ({ ...s, pack: p })))
    .filter((s) => s.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));
  const receipts = filtered
    .flatMap((p) => p.receipts.map((r) => ({ ...r, pack: p })))
    .filter((r) => r.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));
  function exportReport() {
    const rows = [
      [
        t('clients'),
        t('packages'),
        t('packageSales'),
        t('businessIncome'),
        t('businessDebt'),
        t('workoutDone'),
        t('businessPlanned'),
        t('businessCancelled'),
        t('sessionsRemaining'),
      ],
      ...report.rows.map((r) => [
        r.client,
        r.size,
        (r.sales / 100).toFixed(2),
        (r.income / 100).toFixed(2),
        (r.debt / 100).toFixed(2),
        r.completed,
        r.planned,
        r.cancelled,
        r.remaining,
      ]),
    ];
    const csv =
      '\uFEFF' +
      rows
        .map((row) =>
          row
            .map((value) => {
              const text = String(value);
              return (
                '"' + (/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"'
              );
            })
            .join(','),
        )
        .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `business-${month}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageHeading title={t(view)} subtitle={t(`${view}Sub`)}>
        {view !== 'businessReports' && (
          <button
            className="button primary"
            disabled={!loaded || (view === 'packages' ? !links.length : !options.length)}
            onClick={() =>
              open(
                view === 'packages' ? 'package' : view === 'trainingLog' ? 'training' : 'receipt',
              )
            }
          >
            {t(
              view === 'packages'
                ? 'addPackage'
                : view === 'trainingLog'
                  ? 'addTraining'
                  : 'addReceipt',
            )}
          </button>
        )}
        {view === 'businessReports' && (
          <button className="button secondary" disabled={!loaded} onClick={exportReport}>
            {t('exportBusiness')}
          </button>
        )}
      </PageHeading>
      {error && (
        <p role="alert" className="form-error">
          {t(error)}{' '}
          <button className="text-button" onClick={() => load().catch((e) => setError(e.message))}>
            {t('retry')}
          </button>
        </p>
      )}
      <div className="business-filters">
        {view !== 'packages' && (
          <label>
            {t('businessMonth')}
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </label>
        )}
        <label>
          {t('clients')}
          <select value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">{t('allClients')}</option>
            {Array.from(
              new Map([
                ...links.map((r) => [r.client.id, r.client] as const),
                ...packages.map((p) => [p.relationship.client.id, p.relationship.client] as const),
              ]).values(),
            ).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!loaded ? (
        <LoadingCards />
      ) : (
        <>
          {view === 'packages' && (
            <div className="business-cards">
              {filtered.map((p) => {
                const remaining = remainingSessions(p);
                const paid = p.receipts.reduce((a, r) => a + r.amount, 0);
                return (
                  <section className="panel" key={p.id}>
                    <h2>{p.relationship.client.name}</h2>
                    <p>
                      {p.size} {t('trainingSessions')} · <time>{p.date}</time>
                    </p>
                    <strong className={remaining <= 2 ? 'business-low' : ''}>
                      {t('sessionsRemaining')}: {remaining}
                    </strong>
                    <progress
                      value={p.size - remaining}
                      max={p.size}
                      aria-label={t('sessionsUsed')}
                    />
                    <p>
                      {t('packagePrice')}: {money(p.price)}
                    </p>
                    <p>
                      {t('businessPaid')}: {money(paid)} · {t('businessDebt')}:{' '}
                      {money(p.price - paid)}
                    </p>
                    {remaining === 2 && (
                      <p role="status" className="business-low">
                        {t('twoSessionsLeft')}
                      </p>
                    )}
                    {p.relationship.status === 'ACTIVE' && (
                      <div className="business-actions">
                        <button className="button secondary" onClick={() => open('training', p.id)}>
                          {t('addTraining')}
                        </button>
                        <button
                          className="button secondary"
                          disabled={paid === p.price}
                          onClick={() => open('receipt', p.id)}
                        >
                          {t('addReceipt')}
                        </button>
                      </div>
                    )}
                  </section>
                );
              })}
              {!filtered.length && <Empty text={t('noBusinessPackages')} />}
            </div>
          )}
          {view === 'trainingLog' && (
            <div className="business-cards">
              {sessions.map((s) => (
                <section className="panel" key={s.id}>
                  <h2>{s.pack.relationship.client.name}</h2>
                  <p>
                    {s.date} · {s.pack.size} {t('trainingSessions')}
                  </p>
                  <label>
                    {t('status')}
                    <select
                      disabled={busy}
                      value={s.status}
                      onChange={(e) =>
                        change({
                          action: 'status',
                          packageId: s.pack.id,
                          trainingId: s.id,
                          status: e.target.value,
                        })
                      }
                    >
                      {['PLANNED', 'COMPLETED', 'CANCELLED'].map((value) => (
                        <option key={value} value={value}>
                          {statusLabel(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="business-notes">{s.notes}</p>
                </section>
              ))}
              {!sessions.length && <Empty text={t('noBusinessActivity')} />}
            </div>
          )}
          {view === 'clientPayments' && (
            <>
              <div className="business-cards">
                <section className="panel">
                  <h2>{t('businessIncome')}</h2>
                  <strong>{money(report.income)}</strong>
                </section>
                <section className="panel">
                  <h2>{t('businessDebt')}</h2>
                  <strong>{money(report.debt)}</strong>
                  <p>{t('debtSnapshot')}</p>
                </section>
              </div>
              <h2>{t('outstandingPackages')}</h2>
              <div className="business-cards">
                {filtered
                  .filter((p) => p.price > p.receipts.reduce((a, r) => a + r.amount, 0))
                  .map((p) => (
                    <section className="panel" key={p.id}>
                      <h3>
                        {p.relationship.client.name} · {p.size} {t('trainingSessions')}
                      </h3>
                      <strong>
                        {money(p.price - p.receipts.reduce((a, r) => a + r.amount, 0))}
                      </strong>
                      <p>{t('currentDebt')}</p>
                    </section>
                  ))}
              </div>
              <h2>{t('receiptHistory')}</h2>
              <div className="business-cards">
                {receipts.map((r) => (
                  <section className="panel" key={r.id}>
                    <h3>{r.pack.relationship.client.name}</h3>
                    <strong>{money(r.amount)}</strong>
                    <p>
                      {r.date} · {t(`payment_${r.method}`)}
                    </p>
                    <p className="business-notes">{r.notes}</p>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(t('removeReceiptConfirm')))
                          change({
                            action: 'removeReceipt',
                            packageId: r.pack.id,
                            receiptId: r.id,
                          });
                      }}
                    >
                      {t('delete')}
                    </button>
                  </section>
                ))}
                {!receipts.length && <Empty text={t('noBusinessActivity')} />}
              </div>
            </>
          )}
          {view === 'businessReports' && (
            <>
              <div className="business-cards">
                {[
                  [t('businessIncome'), money(report.income)],
                  [t('packageSales'), money(report.sales)],
                  [t('businessDebt'), money(report.debt)],
                  [t('workoutDone'), report.completed],
                  [t('businessPlanned'), report.planned],
                  [t('businessCancelled'), report.cancelled],
                  [t('packagesSold'), report.packagesSold],
                  [t('businessActiveClients'), report.activeClients],
                ].map(([label, value]) => (
                  <section className="panel" key={label}>
                    <h3>{label}</h3>
                    <strong>{value}</strong>
                  </section>
                ))}
              </div>
              <p className="muted">{t('businessReportBasis')}</p>
              <div className="business-table-wrap">
                <table className="business-table">
                  <thead>
                    <tr>
                      {[
                        'clients',
                        'packages',
                        'packageSales',
                        'businessIncome',
                        'businessDebt',
                        'workoutDone',
                        'businessPlanned',
                        'businessCancelled',
                        'sessionsRemaining',
                      ].map((k) => (
                        <th key={k}>{t(k)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.client}</td>
                        <td>{r.size}</td>
                        <td>{money(r.sales)}</td>
                        <td>{money(r.income)}</td>
                        <td>{money(r.debt)}</td>
                        <td>{r.completed}</td>
                        <td>{r.planned}</td>
                        <td>{r.cancelled}</td>
                        <td>{r.remaining}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!report.rows.length && <Empty text={t('noBusinessActivity')} />}
            </>
          )}
        </>
      )}
      {modal && (
        <Modal
          title={t(
            modal === 'package'
              ? 'addPackage'
              : modal === 'training'
                ? 'addTraining'
                : 'addReceipt',
          )}
          onClose={() => setModal(null)}
        >
          <Form
            onSubmit={async (form) => {
              const common = { date: String(form.get('date')) };
              if (modal === 'package')
                await save({
                  action: 'package',
                  ...common,
                  relationshipId: form.get('relationshipId'),
                  size: Number(form.get('size')),
                  price: Math.round(Number(form.get('price')) * 100),
                });
              else if (modal === 'training')
                await save({
                  action: 'training',
                  ...common,
                  packageId: selected,
                  status: form.get('status'),
                  notes: form.get('notes'),
                });
              else
                await save({
                  action: 'receipt',
                  ...common,
                  packageId: selected,
                  amount: Math.round(Number(form.get('amount')) * 100),
                  method: form.get('method'),
                  notes: form.get('notes'),
                });
            }}
          >
            {modal === 'package' ? (
              <>
                <label>
                  {t('clients')}
                  <select name="relationshipId" required>
                    {links.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.client.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('packages')}
                  <select name="size">
                    {[4, 8, 12].map((size) => (
                      <option key={size} value={size}>
                        {size} {t('trainingSessions')}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('packagePrice')} (₪)
                  <input name="price" type="number" min="0.01" max="1000000" step="0.01" required />
                </label>
              </>
            ) : (
              <label>
                {t('packages')}
                <select required value={selected} onChange={(e) => setSelected(e.target.value)}>
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.relationship.client.name} · {p.size} · {p.date} · {t('sessionsRemaining')}:{' '}
                      {remainingSessions(p)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {t('date')}
              <input
                name="date"
                type="date"
                defaultValue={date}
                min={modal !== 'package' ? current?.date : undefined}
                required
              />
            </label>
            {modal === 'training' && (
              <label>
                {t('status')}
                <select name="status" defaultValue="COMPLETED">
                  {['PLANNED', 'COMPLETED', 'CANCELLED'].map((value) => (
                    <option key={value} value={value}>
                      {statusLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {modal === 'receipt' && (
              <>
                <label>
                  {t('businessAmount')} (₪)
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={
                      current
                        ? (current.price - current.receipts.reduce((a, r) => a + r.amount, 0)) / 100
                        : undefined
                    }
                    required
                  />
                </label>
                <label>
                  {t('paymentMethod')}
                  <select name="method">
                    {['cash', 'transfer', 'card', 'other'].map((m) => (
                      <option key={m} value={m}>
                        {t(`payment_${m}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {modal !== 'package' && (
              <label>
                {t('notes')}
                <textarea name="notes" maxLength={1000} />
              </label>
            )}
            <Submit />
          </Form>
        </Modal>
      )}
    </>
  );
}
