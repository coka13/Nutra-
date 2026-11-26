'use client';
import { useEffect, useState } from 'react';
import { Eye, History, Plus, Send, Upload } from 'lucide-react';
import {
  Badge,
  Card,
  Empty,
  ErrorState,
  Field,
  LoadingBlock,
  Modal,
  Notice,
  PageHead,
  Pagination,
  Segment,
  Switch,
  Table,
  Tabs,
  useAdmin,
  useLoad,
} from './ui';

type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };
function useDebounced(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function ContentSection() {
  const { t } = useAdmin();
  const [tab, setTab] = useState<'exercises' | 'foods' | 'ARTICLE' | 'FAQ' | 'templates' | 'translations'>('exercises');
  return (
    <>
      <PageHead title={t('navContent')} subtitle={t('contentSub')} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'exercises', label: t('exercises') },
          { value: 'foods', label: t('foods') },
          { value: 'ARTICLE', label: t('articles') },
          { value: 'FAQ', label: t('faqs') },
          { value: 'templates', label: t('templates') },
          { value: 'translations', label: t('translations') },
        ]}
      />
      {tab === 'exercises' && <ExercisesTab />}
      {tab === 'foods' && <FoodsTab />}
      {(tab === 'ARTICLE' || tab === 'FAQ') && <ItemsTab key={tab} type={tab} />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'translations' && <TranslationsTab />}
    </>
  );
}

type ExerciseRow = { id: string; nameEn: string; nameHe: string; instructionsEn: string; instructionsHe: string; muscle: string; equipment: string; difficulty: string; hidden: boolean; edited: boolean; version: number; media: { mp4: string; poster: string } | null };

function ExercisesTab() {
  const { t, can } = useAdmin();
  const [q, setQ] = useState(''),
    [muscle, setMuscle] = useState(''),
    [filter, setFilter] = useState(''),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<ExerciseRow | null>(null);
  const dq = useDebounced(q);
  const qs = new URLSearchParams({ q: dq, muscle, filter, page: String(page) }).toString();
  const { data, error, reload } = useLoad<Paged<ExerciseRow> & { muscles: string[] }>(`content/exercises?${qs}`, [qs]);
  return (
    <>
      <div className="adm-toolbar">
        <input type="search" placeholder={t('search')} aria-label={t('search')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select aria-label={t('muscle')} value={muscle} onChange={(e) => { setMuscle(e.target.value); setPage(1); }}>
          <option value="">{t('muscle')}: {t('all')}</option>
          {data?.muscles.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <Segment value={filter} onChange={(v) => { setFilter(v); setPage(1); }} options={[{ value: '', label: t('all') }, { value: 'edited', label: t('edited') }, { value: 'hidden', label: t('hidden') }, { value: 'missingHe', label: t('missingHe') }]} />
      </div>
      {error && <ErrorState code={error} onRetry={() => void reload()} />}
      {!data ? (
        <LoadingBlock rows={6} />
      ) : (
        <>
          <Table
            rows={data.items}
            onRowClick={can('content.manage') ? setEditing : undefined}
            columns={[
              { key: 'media', label: t('media'), render: (e) => (e.media ? <img className="adm-media" src={e.media.poster} alt="" loading="lazy" /> : <span className="adm-media" />) },
              { key: 'name', label: t('name'), render: (e) => (<><div className="adm-cell-main">{e.nameEn}</div><div className="adm-cell-sub" dir="rtl">{e.nameHe}</div></>) },
              { key: 'muscle', label: t('muscle'), render: (e) => `${e.muscle} · ${e.equipment}` },
              { key: 'difficulty', label: t('difficulty'), render: (e) => e.difficulty },
              { key: 'state', label: t('status'), render: (e) => (<div className="adm-row">{e.hidden && <Badge kind="red" label={t('hidden')} />}{e.edited && <Badge kind="blue" label={`${t('edited')} v${e.version}`} />}</div>) },
            ]}
          />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {editing && <ExerciseDialog exercise={editing} muscles={data?.muscles ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
    </>
  );
}

function ExerciseDialog({ exercise, muscles, onClose, onSaved }: { exercise: ExerciseRow; muscles: string[]; onClose: () => void; onSaved: () => void }) {
  const { t, api, toast, fail, confirm, formatDate } = useAdmin();
  const [form, setForm] = useState({ nameEn: exercise.nameEn, nameHe: exercise.nameHe, instructionsEn: exercise.instructionsEn, instructionsHe: exercise.instructionsHe, muscle: exercise.muscle, difficulty: exercise.difficulty, hidden: exercise.hidden }),
    [busy, setBusy] = useState(false),
    [showHistory, setShowHistory] = useState(false);
  const history = useLoad<{ history: { id: string; version: number; createdAt: string; createdBy: string }[] }>(showHistory ? `content/exercises/${exercise.id}/history` : null, [showHistory]);
  return (
    <Modal
      wide
      title={exercise.nameEn}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn" onClick={() => setShowHistory(!showHistory)}><History size={15} /> {t('history')}</button>
          {exercise.edited && (
            <button
              className="adm-btn danger"
              disabled={busy}
              onClick={async () => {
                if (!(await confirm({ title: t('revert'), danger: true }))) return;
                try {
                  await api(`content/exercises/${exercise.id}/revert`, {});
                  toast(t('saved'));
                  onSaved();
                } catch (e) {
                  fail(e);
                }
              }}
            >
              {t('revert')}
            </button>
          )}
          <button className="adm-btn" onClick={onClose}>{t('cancel')}</button>
          <button
            className="adm-btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`content/exercises/${exercise.id}`, form);
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
        <Field label={t('nameEn')}><input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></Field>
        <Field label={t('nameHe')}><input dir="rtl" value={form.nameHe} onChange={(e) => setForm({ ...form, nameHe: e.target.value })} /></Field>
        <Field label={t('muscle')}>
          <select value={form.muscle} onChange={(e) => setForm({ ...form, muscle: e.target.value })}>
            {muscles.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label={t('difficulty')}>
          <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
            {['beginner', 'intermediate', 'expert'].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field className="full" label={t('instructionsEn')}><textarea rows={5} value={form.instructionsEn} onChange={(e) => setForm({ ...form, instructionsEn: e.target.value })} /></Field>
        <Field className="full" label={t('instructionsHe')}><textarea dir="rtl" rows={5} value={form.instructionsHe} onChange={(e) => setForm({ ...form, instructionsHe: e.target.value })} /></Field>
        <div className="full">
          <Switch label={t('hidden')} checked={form.hidden} onChange={(hidden) => setForm({ ...form, hidden })} />
          <p className="adm-small adm-muted">{t('hiddenHint')}</p>
        </div>
        {exercise.media && (
          <video className="full" src={exercise.media.mp4} poster={exercise.media.poster} controls muted style={{ maxHeight: 220, borderRadius: 12, background: '#000' }} />
        )}
        {showHistory && (
          <div className="full">
            {history.data?.history.length ? (
              <div className="adm-list">
                {history.data.history.map((h) => (
                  <div key={h.id}>
                    <Badge label={`v${h.version}`} />
                    <span className="adm-small adm-muted">{formatDate(h.createdAt, true)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

type FoodRow = { id: string; nameEn: string; nameHe: string; calories: number; protein: number; carbs: number; fat: number; fiber: number; brand: string | null; source: string; uses: number; warnings: string[] };

function FoodsTab() {
  const { t, can, formatNumber } = useAdmin();
  const [q, setQ] = useState(''),
    [source, setSource] = useState(''),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<Partial<FoodRow> | null>(null),
    [importing, setImporting] = useState(false);
  const dq = useDebounced(q);
  const qs = new URLSearchParams({ q: dq, source, page: String(page) }).toString();
  const { data, error, reload } = useLoad<Paged<FoodRow> & { sources: { source: string; count: number }[] }>(`content/foods?${qs}`, [qs]);
  return (
    <>
      <div className="adm-toolbar">
        <input type="search" placeholder={t('search')} aria-label={t('search')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select aria-label={t('source')} value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
          <option value="">{t('source')}: {t('all')}</option>
          {data?.sources.map((s) => <option key={s.source} value={s.source}>{s.source} ({formatNumber(s.count)})</option>)}
        </select>
        {can('content.manage') && (
          <>
            <button className="adm-btn primary" onClick={() => setEditing({})}><Plus size={15} /> {t('newFood')}</button>
            <button className="adm-btn" onClick={() => setImporting(true)}><Upload size={15} /> {t('bulkImport')}</button>
          </>
        )}
      </div>
      {error && <ErrorState code={error} onRetry={() => void reload()} />}
      {!data ? (
        <LoadingBlock rows={6} />
      ) : (
        <>
          <Table
            rows={data.items}
            onRowClick={can('content.manage') ? setEditing : undefined}
            columns={[
              { key: 'name', label: t('name'), render: (f) => (<><div className="adm-cell-main">{f.nameEn}</div><div className="adm-cell-sub" dir="rtl">{f.nameHe}</div></>) },
              { key: 'kcal', label: `${t('calories')} ${t('per100g')}`, className: 'num', render: (f) => formatNumber(f.calories) },
              { key: 'macros', label: `${t('protein')} / ${t('carbs')} / ${t('fat')}`, className: 'num', render: (f) => `${formatNumber(f.protein, 1)} / ${formatNumber(f.carbs, 1)} / ${formatNumber(f.fat, 1)}` },
              { key: 'source', label: t('source'), render: (f) => <Badge label={f.source} /> },
              { key: 'uses', label: t('uses'), className: 'num', render: (f) => formatNumber(f.uses) },
              { key: 'warn', label: t('warnings'), render: (f) => (f.warnings.length ? <Badge kind="amber" label={f.warnings.map((w) => t(w)).join(', ')} /> : null) },
            ]}
          />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {editing && <FoodDialog food={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} onDone={() => void reload()} />}
    </>
  );
}

function FoodDialog({ food, onClose, onSaved }: { food: Partial<FoodRow>; onClose: () => void; onSaved: () => void }) {
  const { t, api, toast, fail, confirm } = useAdmin();
  const [form, setForm] = useState({ nameEn: food.nameEn ?? '', nameHe: food.nameHe ?? '', calories: food.calories ?? 0, protein: food.protein ?? 0, carbs: food.carbs ?? 0, fat: food.fat ?? 0, fiber: food.fiber ?? 0, brand: food.brand ?? '' }),
    [warnings, setWarnings] = useState<string[]>([]),
    [dupes, setDupes] = useState<{ id: string; nameEn: string; source: string }[]>([]),
    [busy, setBusy] = useState(false);
  async function save(acknowledgeWarnings = false, allowDuplicate = false) {
    setBusy(true);
    try {
      const r = await api<{ saved: boolean; warnings?: string[]; duplicates?: typeof dupes }>('content/foods', { ...form, brand: form.brand || null, id: food.id, acknowledgeWarnings, allowDuplicate });
      if (r.saved) {
        toast(t('saved'));
        onSaved();
        return;
      }
      setWarnings(r.warnings ?? []);
      setDupes(r.duplicates ?? []);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const num = (key: keyof typeof form) => (
    <Field label={t(key)}>
      <input type="number" min={0} step="0.1" value={form[key] as number} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />
    </Field>
  );
  return (
    <Modal
      title={food.id ? food.nameEn ?? '' : t('newFood')}
      onClose={onClose}
      footer={
        <>
          {food.id && (
            <button
              className="adm-btn danger"
              disabled={busy || (food.uses ?? 0) > 0}
              title={(food.uses ?? 0) > 0 ? t('err_foodInUse') : undefined}
              onClick={async () => {
                if (!(await confirm({ title: t('delete'), danger: true }))) return;
                try {
                  await api(`content/foods/${food.id}/delete`, {});
                  toast(t('saved'));
                  onSaved();
                } catch (e) {
                  fail(e);
                }
              }}
            >
              {t('delete')}
            </button>
          )}
          <button className="adm-btn" onClick={onClose}>{t('cancel')}</button>
          {(warnings.length > 0 || dupes.length > 0) && (
            <button className="adm-btn" disabled={busy} onClick={() => save(true, true)}>{t('saveAnyway')}</button>
          )}
          <button className="adm-btn primary" disabled={busy || form.nameEn.length < 2 || form.nameHe.length < 2} onClick={() => save()}>
            {t('save')}
          </button>
        </>
      }
    >
      <div className="adm-form cols">
        <Field label={t('nameEn')}><input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></Field>
        <Field label={t('nameHe')}><input dir="rtl" value={form.nameHe} onChange={(e) => setForm({ ...form, nameHe: e.target.value })} /></Field>
        {num('calories')}
        {num('protein')}
        {num('carbs')}
        {num('fat')}
        {num('fiber')}
        <Field label={t('brand')}><input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
        <p className="full adm-small adm-muted" style={{ margin: 0 }}>{t('per100g')}</p>
        {warnings.length > 0 && <div className="full"><Notice kind="warn">{warnings.map((w) => t(w)).join(' · ')}</Notice></div>}
        {dupes.length > 0 && (
          <div className="full">
            <Notice kind="warn">
              {t('duplicateFound')}: {dupes.map((d) => `${d.nameEn} (${d.source})`).join(', ')}
            </Notice>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Minimal RFC 4180 parser for pasted CSV (quoted fields, commas, newlines). */
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  const [header = [], ...body] = rows;
  const keys = header.map((h) => h.trim());
  return body.map((cells) => Object.fromEntries(keys.map((k, i) => [k, (cells[i] ?? '').trim()])));
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t, api, toast, fail, formatNumber } = useAdmin();
  const [text, setText] = useState(''),
    [report, setReport] = useState<{ dryRun: boolean; imported: number; summary: Record<string, number>; report: { row: number; status: string; name: string; detail?: string }[] } | null>(null),
    [busy, setBusy] = useState(false);
  async function run(dryRun: boolean) {
    const rows = parseCsv(text);
    if (!rows.length) return;
    setBusy(true);
    try {
      const r = await api<NonNullable<typeof report>>('content/foods/import', { rows: rows.slice(0, 2000), dryRun });
      setReport(r);
      if (!dryRun) {
        toast(`${t('imported')}: ${formatNumber(r.imported)}`);
        onDone();
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title={t('bulkImport')}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn" onClick={onClose}>{t('close')}</button>
          <button className="adm-btn" disabled={busy || !text.trim()} onClick={() => run(true)}>{t('validate')}</button>
          <button className="adm-btn primary" disabled={busy || !report?.dryRun || !report.summary.valid} onClick={() => run(false)}>
            {t('import')} {report?.dryRun ? `(${report.summary.valid})` : ''}
          </button>
        </>
      }
    >
      <div className="adm-form">
        <p className="adm-muted adm-small" style={{ margin: 0 }}>{t('importHint')}</p>
        <textarea className="adm-mono" rows={8} value={text} onChange={(e) => { setText(e.target.value); setReport(null); }} placeholder="nameEn,nameHe,calories,protein,carbs,fat,fiber,brand" />
        {report && (
          <>
            <div className="adm-row">
              {(['valid', 'warning', 'duplicate', 'invalid'] as const).map((s) => (
                <Badge key={s} kind={s === 'valid' ? 'green' : s === 'invalid' ? 'red' : 'amber'} label={`${t(s)}: ${formatNumber(report.summary[s] ?? 0)}`} />
              ))}
              {!report.dryRun && <Badge kind="green" label={`${t('imported')}: ${report.imported}`} />}
            </div>
            <Table rows={report.report.filter((r) => r.status !== 'valid').slice(0, 100)} rowKey={(r) => String(r.row)} columns={[{ key: 'row', label: '#', render: (r) => r.row }, { key: 'n', label: t('name'), render: (r) => r.name }, { key: 's', label: t('status'), render: (r) => t(r.status) }, { key: 'd', label: t('details'), render: (r) => (r.detail ? r.detail.split(', ').map((d: string) => t(d)).join(', ') : '') }]} />
          </>
        )}
      </div>
    </Modal>
  );
}

type Item = { id: string; type: string; slug: string; category: string; titleEn: string; titleHe: string; bodyEn: string; bodyHe: string; status: string; position: number; version: number; updatedAt: string };

function ItemsTab({ type }: { type: 'ARTICLE' | 'FAQ' }) {
  const { t, can, formatDate } = useAdmin();
  const { data, error, reload } = useLoad<{ items: Item[] }>(`content/items?type=${type}`, [type]);
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  return (
    <>
      <div className="adm-toolbar">
        {can('content.manage') && <button className="adm-btn primary" onClick={() => setEditing({ type, status: 'DRAFT' })}><Plus size={15} /> {t('newItem')}</button>}
      </div>
      {error && <ErrorState code={error} onRetry={() => void reload()} />}
      {!data ? (
        <LoadingBlock />
      ) : (
        <Table
          rows={data.items}
          onRowClick={can('content.manage') ? setEditing : undefined}
          columns={[
            { key: 't', label: t('titleEn'), render: (i) => (<><div className="adm-cell-main">{i.titleEn}</div><div className="adm-cell-sub" dir="rtl">{i.titleHe}</div></>) },
            { key: 'c', label: t('category'), render: (i) => i.category || '—' },
            { key: 's', label: t('status'), render: (i) => <Badge value={i.status} /> },
            { key: 'v', label: t('version'), className: 'num', render: (i) => `v${i.version}` },
            { key: 'u', label: t('updated'), render: (i) => formatDate(i.updatedAt, true) },
          ]}
        />
      )}
      {editing && <ItemDialog item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
    </>
  );
}

function ItemDialog({ item, onClose, onSaved }: { item: Partial<Item>; onClose: () => void; onSaved: () => void }) {
  const { t, api, toast, fail, formatDate } = useAdmin();
  const [form, setForm] = useState({ slug: item.slug ?? '', category: item.category ?? '', titleEn: item.titleEn ?? '', titleHe: item.titleHe ?? '', bodyEn: item.bodyEn ?? '', bodyHe: item.bodyHe ?? '', status: item.status ?? 'DRAFT', position: item.position ?? 0 }),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<'en' | 'he' | null>(null);
  const history = useLoad<{ history: { id: string; version: number; createdAt: string }[] }>(item.id ? `content/items/${item.id}/history` : null, [item.id]);
  return (
    <Modal
      wide
      title={item.id ? item.titleEn ?? '' : t('newItem')}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn" onClick={() => setPreview(preview ? null : 'en')}><Eye size={15} /> {t('preview')}</button>
          <button className="adm-btn" onClick={onClose}>{t('cancel')}</button>
          <button
            className="adm-btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api('content/items', { ...form, id: item.id, type: item.type });
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
      {preview ? (
        <div className="adm-stack">
          <Segment value={preview} onChange={setPreview} options={[{ value: 'en', label: t('english') }, { value: 'he', label: t('hebrew') }]} />
          <article className="adm-card" dir={preview === 'he' ? 'rtl' : 'ltr'}>
            <h2>{preview === 'he' ? form.titleHe : form.titleEn}</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{preview === 'he' ? form.bodyHe : form.bodyEn}</p>
          </article>
        </div>
      ) : (
        <div className="adm-form cols">
          <Field label={t('slug')}><input className="adm-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} /></Field>
          <Field label={t('category')}><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          <Field label={t('status')}>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {['DRAFT', 'PUBLISHED', 'ARCHIVED'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
            </select>
          </Field>
          <Field label={t('position')}><input type="number" min={0} value={form.position} onChange={(e) => setForm({ ...form, position: Number(e.target.value) })} /></Field>
          <Field className="full" label={t('titleEn')}><input value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} /></Field>
          <Field className="full" label={t('titleHe')}><input dir="rtl" value={form.titleHe} onChange={(e) => setForm({ ...form, titleHe: e.target.value })} /></Field>
          <Field className="full" label={t('bodyEn')}><textarea rows={6} value={form.bodyEn} onChange={(e) => setForm({ ...form, bodyEn: e.target.value })} /></Field>
          <Field className="full" label={t('bodyHe')}><textarea dir="rtl" rows={6} value={form.bodyHe} onChange={(e) => setForm({ ...form, bodyHe: e.target.value })} /></Field>
          {item.id && history.data && history.data.history.length > 0 && (
            <div className="full">
              <h3>{t('history')}</h3>
              <div className="adm-list">
                {history.data.history.map((h) => (
                  <div key={h.id}>
                    <Badge label={`v${h.version}`} />
                    <span className="adm-small adm-muted" style={{ flex: 1 }}>{formatDate(h.createdAt, true)}</span>
                    {h.version !== item.version && (
                      <button
                        className="adm-btn small"
                        onClick={async () => {
                          try {
                            await api(`content/items/${item.id}/restore`, { version: h.version });
                            toast(t('saved'));
                            onSaved();
                          } catch (e) {
                            fail(e);
                          }
                        }}
                      >
                        {t('restore')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function TemplatesTab() {
  const { t, can, api, toast, fail, confirm, formatDate } = useAdmin();
  const [page, setPage] = useState(1);
  const { data, error, reload } = useLoad<Paged<{ id: string; name: string; description: string; weeks: number; days: string; createdAt: string; owner: { id: string; name: string; role: string }; _count: { exercises: number } }>>(`content/templates?page=${page}`, [page]);
  if (error) return <ErrorState code={error} onRetry={() => void reload()} />;
  if (!data) return <LoadingBlock />;
  return (
    <>
      <Table
        rows={data.items}
        columns={[
          { key: 'n', label: t('name'), render: (p) => (<><div className="adm-cell-main">{p.name}</div><div className="adm-cell-sub">{p.description}</div></>) },
          { key: 'o', label: t('owner'), render: (p) => `${p.owner.name} · ${t(p.owner.role)}` },
          { key: 'e', label: t('exercises'), className: 'num', render: (p) => p._count.exercises },
          { key: 'c', label: t('created'), render: (p) => formatDate(p.createdAt) },
          {
            key: 'a',
            label: t('actions'),
            render: (p) =>
              can('content.manage') && (
                <button
                  className="adm-btn small danger"
                  onClick={async () => {
                    if (!(await confirm({ title: t('delete'), text: p.name, danger: true }))) return;
                    try {
                      await api(`content/templates/${p.id}/delete`, {});
                      toast(t('saved'));
                      await reload();
                    } catch (e) {
                      fail(e);
                    }
                  }}
                >
                  {t('delete')}
                </button>
              ),
          },
        ]}
      />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
    </>
  );
}

type TranslationRow = { key: string; en: string; he: string; defaultEn: string; defaultHe: string; overridden: boolean };

function TranslationsTab() {
  const { t, can, api, toast, fail } = useAdmin();
  const [q, setQ] = useState(''),
    [filter, setFilter] = useState(''),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<TranslationRow | null>(null);
  const dq = useDebounced(q);
  const qs = new URLSearchParams({ q: dq, filter, page: String(page) }).toString();
  const { data, error, reload } = useLoad<Paged<TranslationRow>>(`content/translations?${qs}`, [qs]);
  return (
    <>
      <div className="adm-toolbar">
        <input type="search" placeholder={t('search')} aria-label={t('search')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Segment value={filter} onChange={(v) => { setFilter(v); setPage(1); }} options={[{ value: '', label: t('all') }, { value: 'overridden', label: t('overridden') }, { value: 'missingHe', label: t('missingHe') }]} />
      </div>
      {error && <ErrorState code={error} onRetry={() => void reload()} />}
      {!data ? (
        <LoadingBlock rows={8} />
      ) : (
        <>
          <Table
            rows={data.items}
            rowKey={(r) => r.key}
            onRowClick={can('content.manage') ? setEditing : undefined}
            columns={[
              { key: 'k', label: t('key'), render: (r) => (<span className="adm-mono">{r.key} {r.overridden && <Badge kind="blue" label={t('overridden')} />}</span>) },
              { key: 'en', label: t('english'), render: (r) => <span dir="ltr">{r.en}</span> },
              { key: 'he', label: t('hebrew'), render: (r) => <span dir="rtl">{r.he}</span> },
            ]}
          />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {editing && (
        <TranslationDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSave={async (en, he) => {
            try {
              await api(`content/translations/${encodeURIComponent(editing.key)}`, { en, he });
              toast(t('saved'));
              setEditing(null);
              await reload();
            } catch (e) {
              fail(e);
            }
          }}
        />
      )}
    </>
  );
}

function TranslationDialog({ row, onClose, onSave }: { row: TranslationRow; onClose: () => void; onSave: (en: string, he: string) => void }) {
  const { t } = useAdmin();
  const [en, setEn] = useState(row.en),
    [he, setHe] = useState(row.he);
  return (
    <Modal
      title={row.key}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn" onClick={() => { setEn(row.defaultEn); setHe(row.defaultHe); }}>{t('resetDefault')}</button>
          <button className="adm-btn" onClick={onClose}>{t('cancel')}</button>
          <button className="adm-btn primary" onClick={() => onSave(en, he)}>{t('save')}</button>
        </>
      }
    >
      <div className="adm-form">
        <Field label={t('english')} hint={row.defaultEn}><textarea dir="ltr" rows={3} value={en} onChange={(e) => setEn(e.target.value)} /></Field>
        <Field label={t('hebrew')} hint={row.defaultHe}><textarea dir="rtl" rows={3} value={he} onChange={(e) => setHe(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

type Announcement = { id: string; userIds: string; titleEn: string; titleHe: string; bodyEn: string; bodyHe: string; audience: string; inApp: boolean; push: boolean; status: string; scheduledAt: string | null; sentAt: string | null; recipients: number; pushSent: number; pushFailed: number; reads: number; createdAt: string };

export function NotificationsSection() {
  const { t, can, formatDate, formatNumber, api, toast, fail, confirm } = useAdmin();
  const [page, setPage] = useState(1),
    [composing, setComposing] = useState(false);
  const { data, error, reload } = useLoad<Paged<Announcement>>(`announcements?page=${page}`, [page]);
  return (
    <>
      <PageHead title={t('navNotifications')} subtitle={t('notificationsSub')}>
        {can('notifications.send') && <button className="adm-btn primary" onClick={() => setComposing(true)}><Plus size={15} /> {t('newAnnouncement')}</button>}
      </PageHead>
      {error && <ErrorState code={error} onRetry={() => void reload()} />}
      {!data ? (
        <LoadingBlock />
      ) : (
        <>
          <Table
            rows={data.items}
            columns={[
              { key: 't', label: t('titleEn'), render: (a) => (<><div className="adm-cell-main">{a.titleEn}</div><div className="adm-cell-sub" dir="rtl">{a.titleHe}</div></>) },
              { key: 'aud', label: t('audience'), render: (a) => (<>{t(a.audience)}<div className="adm-cell-sub">{[a.inApp && t('inApp'), a.push && t('push')].filter(Boolean).join(' · ')}</div></>) },
              { key: 's', label: t('status'), render: (a) => (<><Badge value={a.status} />{a.scheduledAt && a.status === 'SCHEDULED' && <div className="adm-cell-sub">{formatDate(a.scheduledAt, true)}</div>}</>) },
              { key: 'r', label: t('recipients'), className: 'num', render: (a) => (a.status === 'SENT' ? formatNumber(a.recipients) : '—') },
              { key: 'rd', label: t('reads'), className: 'num', render: (a) => (a.status === 'SENT' && a.inApp ? `${formatNumber(a.reads)} (${a.recipients ? formatNumber((a.reads / a.recipients) * 100, 1) : 0}%)` : '—') },
              { key: 'p', label: t('pushDelivered'), className: 'num', render: (a) => (a.push && a.status === 'SENT' ? `${formatNumber(a.pushSent)} / ${formatNumber(a.pushFailed)} ✕` : '—') },
              { key: 'd', label: t('created'), render: (a) => formatDate(a.sentAt ?? a.createdAt, true) },
              {
                key: 'x',
                label: t('actions'),
                render: (a) =>
                  can('notifications.send') && ['DRAFT', 'SCHEDULED'].includes(a.status) ? (
                    <div className="adm-row">
                      <button
                        className="adm-btn small primary"
                        onClick={async () => {
                          try {
                            const reach = await api<{ recipients: number }>('announcements/preview', { audience: a.audience, userIds: a.userIds.split(',').filter(Boolean) });
                            if (!(await confirm({ title: t('send'), text: t('sendConfirm', { n: formatNumber(reach.recipients) }), confirmLabel: t('send') }))) return;
                            await api(`announcements/${a.id}/send`, { confirm: true, expectedRecipients: reach.recipients });
                            toast(t('sent'));
                            await reload();
                          } catch (e) {
                            fail(e);
                          }
                        }}
                      >
                        {t('send')}
                      </button>
                      <button
                        className="adm-btn small"
                        onClick={async () => {
                          try {
                            await api(`announcements/${a.id}/cancel`, {});
                            await reload();
                          } catch (e) {
                            fail(e);
                          }
                        }}
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  ) : null,
              },
            ]}
          />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {composing && <ComposeDialog onClose={() => setComposing(false)} onDone={() => { setComposing(false); void reload(); }} />}
    </>
  );
}

function ComposeDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t, api, toast, fail, confirm, formatNumber } = useAdmin();
  const [form, setForm] = useState({ titleEn: '', titleHe: '', bodyEn: '', bodyHe: '', audience: 'ALL', userIds: '', inApp: true, push: false, mode: 'now' as 'now' | 'schedule' | 'draft', scheduledAt: '' }),
    [reach, setReach] = useState<{ recipients: number; pushReachable: number } | null>(null),
    [busy, setBusy] = useState(false),
    [previewLang, setPreviewLang] = useState<'en' | 'he'>('en');
  const ids = form.userIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  useEffect(() => {
    setReach(null);
    const timer = setTimeout(() => {
      api<{ recipients: number; pushReachable: number }>('announcements/preview', { audience: form.audience, userIds: ids }).then(setReach).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.audience, form.userIds]);
  const ready = form.titleEn.length >= 2 && form.titleHe.length >= 2 && form.bodyEn.length >= 2 && form.bodyHe.length >= 2 && (form.inApp || form.push) && (form.audience !== 'USERS' || ids.length > 0) && (form.mode !== 'schedule' || !!form.scheduledAt);
  return (
    <Modal
      wide
      title={t('newAnnouncement')}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn" onClick={onClose}>{t('cancel')}</button>
          <button
            className="adm-btn primary"
            disabled={busy || !ready || !reach}
            onClick={async () => {
              if (!reach) return;
              if (form.mode !== 'draft' && !(await confirm({ title: t(form.mode === 'now' ? 'sendNow' : 'schedule'), text: t('sendConfirm', { n: formatNumber(reach.recipients) }), confirmLabel: t(form.mode === 'now' ? 'send' : 'schedule') }))) return;
              setBusy(true);
              try {
                await api('announcements', {
                  ...form,
                  userIds: ids,
                  scheduledAt: form.mode === 'schedule' ? new Date(form.scheduledAt).toISOString() : undefined,
                  confirm: form.mode !== 'draft',
                  expectedRecipients: reach.recipients,
                });
                toast(t(form.mode === 'now' ? 'sent' : 'saved'));
                onDone();
              } catch (e) {
                fail(e);
                setBusy(false);
              }
            }}
          >
            <Send size={15} /> {t(form.mode === 'now' ? 'sendNow' : form.mode === 'schedule' ? 'schedule' : 'saveDraft')}
          </button>
        </>
      }
    >
      <div className="adm-grid two">
        <div className="adm-form">
          <Field label={t('titleEn')}><input maxLength={120} value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} /></Field>
          <Field label={t('bodyEn')}><textarea maxLength={1000} rows={3} value={form.bodyEn} onChange={(e) => setForm({ ...form, bodyEn: e.target.value })} /></Field>
          <Field label={t('titleHe')}><input dir="rtl" maxLength={120} value={form.titleHe} onChange={(e) => setForm({ ...form, titleHe: e.target.value })} /></Field>
          <Field label={t('bodyHe')}><textarea dir="rtl" maxLength={1000} rows={3} value={form.bodyHe} onChange={(e) => setForm({ ...form, bodyHe: e.target.value })} /></Field>
        </div>
        <div className="adm-form" style={{ alignContent: 'start' }}>
          <Field label={t('audience')}>
            <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              {['ALL', 'COACHES', 'INDEPENDENT', 'COACH_CLIENTS', 'PREMIUM', 'USERS'].map((a) => <option key={a} value={a}>{t(a === 'INDEPENDENT' ? 'independentTrainees' : a === 'PREMIUM' ? 'premiumSubscribers' : a)}</option>)}
            </select>
          </Field>
          {form.audience === 'USERS' && <Field label={t('userIds')}><textarea className="adm-mono" rows={2} value={form.userIds} onChange={(e) => setForm({ ...form, userIds: e.target.value })} /></Field>}
          <div className="adm-row">
            <Switch label={t('inApp')} checked={form.inApp} onChange={(inApp) => setForm({ ...form, inApp })} />
            <Switch label={t('push')} checked={form.push} onChange={(push) => setForm({ ...form, push })} />
          </div>
          <Segment value={form.mode} onChange={(mode) => setForm({ ...form, mode })} options={[{ value: 'now', label: t('sendNow') }, { value: 'schedule', label: t('schedule') }, { value: 'draft', label: t('saveDraft') }]} />
          {form.mode === 'schedule' && <Field label={t('scheduledFor')}><input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} /></Field>}
          <Notice>
            {t('recipients')}: <strong>{reach ? formatNumber(reach.recipients) : '…'}</strong>
            {form.push && reach && <> · {t('pushReachable')}: <strong>{formatNumber(reach.pushReachable)}</strong></>}
          </Notice>
          <div>
            <div className="adm-spread" style={{ marginBottom: 6 }}>
              <h3 style={{ margin: 0 }}>{t('preview')}</h3>
              <Segment value={previewLang} onChange={setPreviewLang} options={[{ value: 'en', label: 'EN' }, { value: 'he', label: 'עב' }]} />
            </div>
            <div className="adm-msg" dir={previewLang === 'he' ? 'rtl' : 'ltr'}>
              <strong>{previewLang === 'he' ? form.titleHe || '—' : form.titleEn || '—'}</strong>
              <br />
              {previewLang === 'he' ? form.bodyHe : form.bodyEn}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
