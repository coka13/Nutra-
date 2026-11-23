'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Dumbbell,
  Leaf,
  Loader2,
  MessageSquare,
  Plus,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Relationship, State } from '@/lib/types';
import { api, Empty, Form, localDay, Submit, useNutri } from './workspace';
import { PersonalRecords } from './exercise-details';
import { Bodyweight } from './bodyweight';
import { ProgressPhotos } from './progress-photos';

type Tab = 'overview' | 'weight' | 'workouts' | 'nutrition' | 'notes';
const tabs: [Tab, string][] = [
  ['overview', 'clientOverview'],
  ['weight', 'weight'],
  ['workouts', 'clientWorkouts'],
  ['nutrition', 'nutrition'],
  ['notes', 'notes'],
];
const ranges = [30, 90, 365, 0] as const;
const DAY = 86400000;

type Workout = State['workouts'][number];

function workoutStats(workout: Workout) {
  const done = workout.sets.filter((set) => set.completed);
  return {
    done: done.length,
    total: workout.sets.length,
    volume: done.reduce((sum, set) => sum + set.weight * set.reps, 0),
    minutes: Math.round(workout.elapsedSeconds / 60),
  };
}

export function ClientProfile({ link, onBack }: { link: Relationship; onBack: () => void }) {
  const { t, run, navigate, number, lang, formatDate } = useNutri();
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  const [tab, setTab] = useState<Tab>('overview');
  const [date, setDate] = useState(localDay());
  const [records, setRecords] = useState<State | null>(null);
  const [loadError, setLoadError] = useState('');
  const [adherence, setAdherence] = useState<{ completed: number; scheduled: number } | null>(null);
  const [range, setRange] = useState<(typeof ranges)[number]>(90);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [reload, setReload] = useState(0);
  const clientId = link.clientId;

  useEffect(() => {
    let current = true;
    async function update() {
      try {
        const next = await api<State>(
          `state?userId=${encodeURIComponent(clientId)}&date=${encodeURIComponent(date)}`,
        );
        if (current) {
          setRecords(next);
          setLoadError('');
        }
      } catch (cause) {
        if (current) setLoadError(cause instanceof Error ? cause.message : 'offline');
      }
    }
    void update();
    const timer = setInterval(() => {
      if (!document.hidden) void update();
    }, 10000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [clientId, date, reload]);

  useEffect(() => {
    let current = true;
    api<{ completed: number; scheduled: number }>('clients/check-schedule', { clientId })
      .then((summary) => {
        if (current) setAdherence(summary);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [clientId]);

  const weights = useMemo(
    () =>
      (records?.progress ?? [])
        .filter((p) => p.kind === 'weight' && p.value > 0)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date)),
    [records?.progress],
  );
  const finished = useMemo(
    () => (records?.workouts ?? []).filter((w) => w.status === 'FINISHED'),
    [records?.workouts],
  );
  const live = records?.workouts.find((w) => w.status === 'ACTIVE' || w.status === 'PAUSED');

  // Calendar dates are formatted in UTC so the day never shifts.
  const dayLabel = (value: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
      new Date(`${value}T00:00:00Z`),
    );

  const latest = weights.at(-1);
  const monthAgo = new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10);
  const baseline = weights.filter((w) => w.date <= monthAgo).at(-1) ?? weights[0];
  const weightChange =
    latest && baseline && latest.id !== baseline.id ? latest.value - baseline.value : undefined;
  const recent30 = finished.filter((w) => Date.now() - +new Date(w.startedAt) <= 30 * DAY);
  const lastWorkout = finished[0];
  const daysSince = lastWorkout
    ? Math.floor((Date.now() - +new Date(lastWorkout.startedAt)) / DAY)
    : undefined;

  const chartWeights = range
    ? weights.filter((w) => +new Date(`${w.date}T00:00:00Z`) >= Date.now() - range * DAY)
    : weights;

  const weekly = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    return Array.from({ length: 8 }, (_, i) => {
      const from = +startOfWeek - (7 - i) * 7 * DAY;
      const to = from + 7 * DAY;
      return {
        label: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric' }).format(from),
        count: finished.filter((w) => {
          const at = +new Date(w.startedAt);
          return at >= from && at < to;
        }).length,
      };
    });
  }, [finished, locale]);

  const totals = (records?.meals ?? []).reduce(
    (a, m) => ({
      calories: a.calories + (m.food.calories * m.grams) / 100,
      protein: a.protein + (m.food.protein * m.grams) / 100,
      carbs: a.carbs + (m.food.carbs * m.grams) / 100,
      fat: a.fat + (m.food.fat * m.grams) / 100,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const calorieTarget = records?.profile?.calorieTarget ?? null;
  const proteinTarget = records?.profile?.proteinTarget ?? null;
  const targets = { calories: calorieTarget, protein: proteinTarget } as Partial<
    Record<keyof typeof totals, number | null>
  >;

  const tooltipStyle = {
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: 10,
  };

  const weightChart = (height: number) =>
    chartWeights.length ? (
      <div className="chart" style={{ height }} role="img" aria-label={t('weightTrend')}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartWeights} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 4" stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => dayLabel(d, { day: 'numeric', month: 'short' })}
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              minTickGap={28}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              tickFormatter={number}
              width={44}
            />
            <Tooltip
              labelFormatter={(d) => dayLabel(String(d), { day: 'numeric', month: 'long' })}
              formatter={(value) => [`${number(Number(value))} ${t('kg')}`, t('weight')]}
              contentStyle={tooltipStyle}
            />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="value"
              stroke="var(--green)"
              strokeWidth={3}
              dot={chartWeights.length < 40 ? { r: 3 } : false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    ) : (
      <Empty text={t('noWeightYet')} />
    );

  const rangePicker = (
    <div className="segmented compact-segmented" role="radiogroup" aria-label={t('weightTrend')}>
      {ranges.map((days) => (
        <button
          key={days}
          type="button"
          role="radio"
          aria-checked={range === days}
          className={range === days ? 'active' : ''}
          onClick={() => setRange(days)}
        >
          {days ? `${days} ${t('daysShort')}` : t('all')}
        </button>
      ))}
    </div>
  );

  const workoutRow = (w: Workout) => {
    const s = workoutStats(w);
    return (
      <div className="list-row client-workout-row" key={w.id}>
        <span className="grow">
          <strong>{w.name}</strong>
          <small>
            {formatDate(w.startedAt, { weekday: 'short', day: 'numeric', month: 'short' })}
            {s.minutes > 0 && ` · ${s.minutes} ${t('min')}`}
          </small>
        </span>
        <small>
          {s.done}/{s.total} {t('sets')}
        </small>
        {s.volume > 0 && (
          <small className="muted">
            {number(Math.round(s.volume))} {t('kg')}
          </small>
        )}
        {w.status !== 'FINISHED' && (
          <span className="badge">{t(w.status === 'PAUSED' ? 'pause' : 'activeLabel')}</span>
        )}
      </div>
    );
  };

  const initials = link.client.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('');

  return (
    <div className="client-profile">
      <button type="button" className="text-button client-profile-back" onClick={onBack}>
        {lang === 'he' ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
        {t('allClients')}
      </button>
      <header className="panel client-profile-header">
        <span className="avatar client-profile-avatar">{initials}</span>
        <div className="grow">
          <h1>{link.client.name}</h1>
          <small dir="ltr">{link.client.email}</small>
          {link.tags && (
            <div className="client-tags">
              {link.tags
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean)
                .map((tag) => (
                  <span className="badge neutral" key={tag}>
                    {tag}
                  </span>
                ))}
            </div>
          )}
        </div>
        <div className="row wrap client-profile-actions">
          <button
            className="button secondary"
            onClick={() => navigate(`messages?with=${encodeURIComponent(clientId)}`)}
          >
            <MessageSquare size={16} />
            {t('messages')}
          </button>
          <button
            className="button primary"
            onClick={() => navigate(`builder?client=${encodeURIComponent(clientId)}`)}
          >
            <Plus size={16} />
            {t('newProgram')}
          </button>
        </div>
      </header>

      {live && (
        <div className="client-live-banner" role="status">
          <span className="live-dot" aria-hidden="true" />
          <strong>{t(live.status === 'PAUSED' ? 'pause' : 'clientTrainingNow')}</strong>
          <span>
            {live.name} · {workoutStats(live).done}/{workoutStats(live).total} {t('sets')}
          </span>
        </div>
      )}

      <div className="client-kpis">
        <div className="panel client-kpi">
          <span className="client-kpi-icon">
            <Scale size={17} />
          </span>
          <small>{t('latestWeight')}</small>
          <strong>
            {latest ? number(latest.value) : '—'} <em>{t('kg')}</em>
          </strong>
          {weightChange !== undefined ? (
            <span className={`client-kpi-trend ${weightChange > 0 ? 'up' : 'down'}`}>
              {weightChange > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {weightChange > 0 ? '+' : ''}
              {number(weightChange)} {t('kg')} · {t('last30Days')}
            </span>
          ) : (
            <span className="muted small-copy">
              {latest ? dayLabel(latest.date, { day: 'numeric', month: 'short' }) : ''}
            </span>
          )}
        </div>
        <div className="panel client-kpi">
          <span className="client-kpi-icon">
            <Dumbbell size={17} />
          </span>
          <small>{t('workoutsLast30')}</small>
          <strong>{number(recent30.length)}</strong>
          <span className="muted small-copy">
            {lastWorkout
              ? daysSince === 0
                ? `${t('lastWorkout')}: ${t('today')}`
                : `${t('lastWorkout')}: ${t('daysAgo').replace('{n}', String(daysSince))}`
              : t('noWorkoutsYet')}
          </span>
        </div>
        <div className="panel client-kpi">
          <span className="client-kpi-icon">
            <CalendarCheck size={17} />
          </span>
          <small>{t('adherence')}</small>
          <strong>
            {adherence?.scheduled
              ? `${Math.round((adherence.completed / adherence.scheduled) * 100)}%`
              : '—'}
          </strong>
          <span className="muted small-copy">
            {adherence ? `${adherence.completed} / ${adherence.scheduled}` : ''}
          </span>
        </div>
        <div className="panel client-kpi">
          <span className="client-kpi-icon">
            <Leaf size={17} />
          </span>
          <small>
            {t('nutrition')} · {date === localDay() ? t('today') : date}
          </small>
          <strong>
            {number(Math.round(totals.calories))}
            {calorieTarget !== null && ` / ${number(calorieTarget)}`} <em>{t('kcal')}</em>
          </strong>
          <span className="muted small-copy">
            {t('protein')} {number(Math.round(totals.protein))}
            {proteinTarget !== null && ` / ${number(proteinTarget)}`} {t('grams')}
          </span>
        </div>
      </div>

      <div className="client-tabs" role="tablist" aria-label={t('clientProfile')}>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {!records && !loadError && (
        <p role="status" className="client-loading">
          <Loader2 className="spin" size={18} /> {t('loading')}
        </p>
      )}
      {loadError && !records && <p className="form-error">{t(loadError)}</p>}

      {records && tab === 'overview' && (
        <div className="client-overview-grid">
          <section className="panel">
            <div className="section-heading">
              <h2>{t('weightTrend')}</h2>
              {rangePicker}
            </div>
            {weightChart(240)}
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>{t('recentWorkouts')}</h2>
              <button className="text-button" onClick={() => setTab('workouts')}>
                {t('viewAll')}
              </button>
            </div>
            {records.workouts.length ? (
              records.workouts.slice(0, 5).map(workoutRow)
            ) : (
              <Empty text={t('noWorkoutsYet')} />
            )}
          </section>
        </div>
      )}

      {records && tab === 'weight' && (
        <>
          <section className="panel">
            <div className="section-heading">
              <h2>{t('weightTrend')}</h2>
              {rangePicker}
            </div>
            {weightChart(300)}
          </section>
          <Bodyweight key={clientId} userId={clientId} />
          <ProgressPhotos userId={clientId} />
        </>
      )}

      {records && tab === 'workouts' && (
        <>
          <section className="panel">
            <h2>{t('workoutsPerWeek')}</h2>
            <div className="chart" style={{ height: 180 }} role="img">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 4" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'var(--muted)' }}
                    width={28}
                  />
                  <Tooltip
                    formatter={(value) => [value, t('workoutCount')]}
                    contentStyle={tooltipStyle}
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="count"
                    fill="var(--green)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="panel">
            <h2>{t('history')}</h2>
            {records.workouts.length ? (
              records.workouts.slice(0, 30).map(workoutRow)
            ) : (
              <Empty text={t('noWorkoutsYet')} />
            )}
          </section>
          <PersonalRecords userId={clientId} />
        </>
      )}

      {records && tab === 'nutrition' && (
        <section className="panel">
          <h2>{t('nutritionTargets')}</h2>
          <Form
            key={`${calorieTarget}-${proteinTarget}`}
            onSubmit={async (f) => {
              const value = (name: string) => {
                const raw = String(f.get(name) ?? '').trim();
                return raw ? Number(raw) : null;
              };
              await run(
                'profile/calorie-target',
                { userId: clientId, calorieTarget: value('calorieTarget') },
                true,
              );
              await run('profile/protein-target', {
                userId: clientId,
                proteinTarget: value('proteinTarget'),
              });
              setReload((n) => n + 1);
            }}
          >
            <div className="row wrap">
              <label className="grow">
                {t('calorieTarget')} ({t('kcal')})
                <input
                  type="number"
                  name="calorieTarget"
                  min={500}
                  max={10000}
                  step={10}
                  placeholder={t('noTarget')}
                  defaultValue={calorieTarget ?? ''}
                />
              </label>
              <label className="grow">
                {t('proteinTarget')} ({t('grams')})
                <input
                  type="number"
                  name="proteinTarget"
                  min={10}
                  max={500}
                  step={1}
                  placeholder={t('noTarget')}
                  defaultValue={proteinTarget ?? ''}
                />
              </label>
            </div>
            <Submit>{t('setTargets')}</Submit>
          </Form>
        </section>
      )}

      {records && tab === 'nutrition' && (
        <section className="panel">
          <div className="section-heading">
            <h2>{t('diary')}</h2>
            <input
              type="date"
              aria-label={t('date')}
              value={date}
              max={localDay()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </div>
          <div className="client-macros">
            {(
              [
                ['calories', 'energy', 'kcal'],
                ['protein', 'protein', 'grams'],
                ['carbs', 'carbs', 'grams'],
                ['fat', 'fat', 'grams'],
              ] as const
            ).map(([key, label, unit]) => (
              <div key={key}>
                <small>{t(label)}</small>
                <strong>
                  {number(Math.round(totals[key]))}
                  {targets[key] != null && ` / ${number(targets[key])}`} <em>{t(unit)}</em>
                </strong>
                {targets[key] != null && (
                  <div className="calorie-bar" aria-hidden>
                    <span
                      style={{ width: `${Math.min(100, (totals[key] / targets[key]) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          {records.meals.length ? (
            (['breakfast', 'lunch', 'dinner', 'snack'] as const).map((meal) => {
              const rows = records.meals.filter((m) => m.meal === meal);
              if (!rows.length) return null;
              return (
                <div key={meal} className="client-meal-group">
                  <h3>{t(meal)}</h3>
                  {rows.map((m) => (
                    <div key={m.id} className="list-row">
                      <span className="grow">{lang === 'he' ? m.food.nameHe : m.food.nameEn}</span>
                      <small className="muted">
                        {number(Math.round(m.grams))} {t('grams')}
                      </small>
                      <small>
                        {number(Math.round((m.food.calories * m.grams) / 100))} {t('kcal')}
                      </small>
                    </div>
                  ))}
                </div>
              );
            })
          ) : (
            <Empty text={t('noMealsThisDay')} />
          )}
        </section>
      )}

      {tab === 'notes' && (
        <section className="panel">
          <Form
            onSubmit={async (f) => {
              await run('clients/update', {
                id: link.id,
                notes: f.get('notes'),
                tags: f.get('tags'),
              });
            }}
          >
            <label>
              {t('tags')}
              <input
                name="tags"
                defaultValue={link.tags}
                maxLength={300}
                placeholder={t('tagsHint')}
              />
            </label>
            <label>
              {t('notes')}
              <textarea name="notes" rows={8} defaultValue={link.notes} maxLength={5000} />
            </label>
            <Submit />
          </Form>
          <div className="client-danger-zone">
            {confirmRevoke ? (
              <div className="row wrap">
                <span>{t('revokeConfirm')}</span>
                <button
                  className="button danger"
                  onClick={async () => {
                    try {
                      await run('clients/revoke', { id: link.id });
                      onBack();
                    } catch {}
                  }}
                >
                  {t('revoke')}
                </button>
                <button className="button secondary" onClick={() => setConfirmRevoke(false)}>
                  {t('cancel')}
                </button>
              </div>
            ) : (
              <button className="text-button danger-text" onClick={() => setConfirmRevoke(true)}>
                {t('revoke')}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
