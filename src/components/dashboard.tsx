'use client';
import { coachBrandStyle } from '@/lib/brand-theme';
import { CoachContact } from './coach-contact';
import { currentWorkout } from '@/lib/workout-clock';
import { PersonalRecords } from './exercise-details';
import { ProgressPhotos } from './progress-photos';
import { Bodyweight } from './bodyweight';
import { WeightProgress } from './weight-progress';
import { useEffect, type CSSProperties } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Dumbbell,
  Flame,
  Leaf,
  MessageSquare,
  Plus,
  Sparkles,
  Timer,
  TrendingUp,
  Droplets,
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
import { DatePicker, Empty, PageHeading, localDay, useNutri } from './workspace';
import { BrandMark, brandBackgroundUrl } from './brand-logo';
import type { Relationship } from '@/lib/types';
export function Dashboard() {
  const { state, t, lang, navigate, run, number, formatDate, setDate } = useNutri();
  useEffect(() => {
    setDate(localDay());
  }, [setDate]);
  const completed = state.workouts.filter((w) => w.status === 'FINISHED'),
    weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekly = completed.filter((w) => new Date(w.startedAt) >= weekStart),
    goal = state.profile?.frequency || 3;
  const minutes = weekly.reduce((n, w) => n + Math.round(w.elapsedSeconds / 60), 0);
  const volume = weekly.reduce(
    (n, w) => n + w.sets.filter((s) => s.completed).reduce((a, s) => a + s.reps * s.weight, 0),
    0,
  );
  const totals = state.meals.reduce(
    (a, m) => ({
      calories: a.calories + (m.food.calories * m.grams) / 100,
      protein: a.protein + (m.food.protein * m.grams) / 100,
      carbs: a.carbs + (m.food.carbs * m.grams) / 100,
      fat: a.fat + (m.food.fat * m.grams) / 100,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const active = currentWorkout(state.workouts),
    program = state.programs[0];
  const water = state.water.reduce((n, w) => n + w.ml, 0);
  const chart = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const daily = completed.filter((w) => localDay(new Date(w.startedAt)) === localDay(d));
    return {
      day: formatDate(d.toISOString(), { weekday: 'short' }),
      [t('workoutCount')]: daily.length,
    };
  });
  const coach = state.relationships.find(
    (l) => l.clientId === state.user.id && l.status === 'ACTIVE',
  );
  async function start() {
    if (active) {
      navigate('active');
      return;
    }
    if (!program) {
      navigate('builder');
      return;
    }
    const workout = (await run('workouts/start', { programId: program.id }, true)) as {
      id: string;
    };
    navigate(`active?session=${workout.id}`);
  }
  return (
    <>
      <PageHeading
        title={`${t('greeting')} ${state.user.name.split(' ')[0]} ${lang === 'en' ? '☀' : '☀'}`}
        subtitle={t('dashboardSub')}
      >
        <button className="button secondary" onClick={() => navigate('activity')}>
          <Activity size={16} />
          {t('activity')}
        </button>
        <button className="button secondary" onClick={() => navigate('calendar')}>
          <CalendarDays size={16} />
          {t('calendar')}
        </button>
      </PageHeading>
      {state.user.role === 'COACH' && (
        <div className="coach-stats">
          {[
            [
              'activeClients',
              state.relationships.filter(
                (l) => l.coachId === state.user.id && l.status === 'ACTIVE',
              ).length,
            ],
            [
              'pending',
              state.relationships.filter(
                (l) => l.coachId === state.user.id && l.status === 'PENDING',
              ).length,
            ],
            [
              'upcoming',
              state.appointments.filter(
                (a) => a.status === 'BOOKED' && new Date(a.startsAt) > new Date(),
              ).length,
            ],
            [
              'unread',
              state.messages.filter((m) => m.recipientId === state.user.id && !m.readAt).length,
            ],
          ].map(([k, v]) => (
            <button
              className="panel"
              key={k}
              onClick={() =>
                navigate(k === 'upcoming' ? 'calendar' : k === 'unread' ? 'messages' : 'clients')
              }
            >
              <small>{t(String(k))}</small>
              <h2>{v}</h2>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </div>
      )}
      {coach && <CoachHero link={coach} />}
      <div className="stats-grid">
        <Stat
          icon={<Dumbbell size={18} />}
          label={t('workoutCount')}
          value={String(weekly.length)}
          suffix={t('sessions')}
          detail={t('week')}
          color="green"
        />
        <Stat
          icon={<Timer size={18} />}
          label={t('minutes')}
          value={number(minutes)}
          suffix={t('min')}
          detail={t('week')}
          color="purple"
        />
        <Stat
          icon={<TrendingUp size={18} />}
          label={t('volume')}
          value={number(state.profile?.units === 'imperial' ? volume * 2.20462 : volume)}
          suffix={t(state.profile?.units === 'imperial' ? 'lbs' : 'kg')}
          detail={t('week')}
          color="orange"
        />
        <Stat
          icon={<Leaf size={18} />}
          label={t('energy')}
          value={number(Math.round(totals.calories))}
          suffix={t('kcal')}
          detail={t('today')}
          color="blue"
        />
      </div>
      <div className="dashboard-columns">
        <div className="dashboard-main">
          <section className="training-section">
            <div className="section-heading">
              <h2>{t('training')}</h2>
              <button className="text-button muted" onClick={() => navigate('workouts')}>
                {t('viewAll')}
                <ChevronRight size={15} />
              </button>
            </div>
            <div className="workout-hero">
              <div className="hero-lines" />
              <div className="workout-hero-content">
                <span className="hero-eyebrow">
                  <span className="live-dot" />
                  {t(active ? 'activeLabel' : 'nextWorkout')}
                </span>
                <span className="workout-chip">{t('focus')}</span>
                <h2>{active?.name || program?.name || t('freshStart')}</h2>
                <p>{program?.description || t('programsSub')}</p>
                <div className="hero-metadata">
                  <span>
                    <Dumbbell size={15} />
                    {program?.exercises.length || 0} {t('exercises')}
                  </span>
                  <span>
                    <Timer size={15} />
                    {state.profile?.duration || 40} {t('min')}
                  </span>
                </div>
                <button className="button lime" onClick={() => start().catch(() => {})}>
                  {t(active ? 'resume' : program ? 'startWorkout' : 'newProgram')}
                  <ArrowUpRight size={17} />
                </button>
              </div>
              <img
                className="workout-home-art"
                src="/nutri-home.webp"
                width={1000}
                height={1094}
                alt=""
              />
            </div>
          </section>
          <section className="panel activity-panel">
            <div className="section-heading">
              <div>
                <h2>{t('weeklyActivity')}</h2>
                <p>{t('activitySub')}</p>
              </div>
              <span className="badge neutral">{t('week')}</span>
            </div>
            <div className="chart" role="img" aria-label={`${t('workoutCount')}: ${weekly.length}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} barSize={25}>
                  <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--line)" />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    dy={10}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    width={25}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--subtle)' }}
                    contentStyle={{
                      background: 'var(--panel)',
                      border: '1px solid var(--line)',
                      borderRadius: 12,
                    }}
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey={t('workoutCount')}
                    fill="#25816a"
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="panel nutrition-overview">
            <div className="section-heading">
              <div className="row">
                <span className="tile-icon peach">
                  <UtensilIcon />
                </span>
                <div>
                  <h2>{t('nutritionToday')}</h2>
                  <p>{t('nutritionSub')}</p>
                </div>
              </div>
              <button
                className="round-button"
                aria-label={t('addFood')}
                onClick={() => navigate('nutrition')}
              >
                <Plus size={19} />
              </button>
            </div>
            <div className="macro-row">
              {(['protein', 'carbs', 'fat'] as const).map((m, i) => (
                <div className="macro-mini" key={m}>
                  <div className="row">
                    <span className={`dot macro-${i}`} />
                    <span>{t(m)}</span>
                  </div>
                  <strong>
                    {number(Math.round(totals[m]))}
                    <small> {t('grams')}</small>
                  </strong>
                  <div
                    className="macro-decoration"
                    style={{ background: ['#a4cbb8', '#e4cc94', '#c5b5d8'][i] }}
                  />
                </div>
              ))}
            </div>
            <button className="text-button" onClick={() => navigate('nutrition')}>
              {t('diary')}
              <ArrowRight size={15} />
            </button>
          </section>
        </div>
        <div className="dashboard-side">
          <section className="panel rhythm-card">
            <div className="section-heading">
              <h2>{t('weekGoal')}</h2>
              <span className="tile-icon small-tile">
                <Flame size={17} />
              </span>
            </div>
            <div className="progress-ring">
              <svg viewBox="0 0 160 160">
                <circle
                  cx="80"
                  cy="80"
                  r="65"
                  fill="none"
                  stroke="var(--subtle)"
                  strokeWidth="11"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="65"
                  fill="none"
                  stroke="#27836b"
                  strokeWidth="11"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.min(weekly.length / goal, 1) * 408.4} 408.4`}
                  transform="rotate(-90 80 80)"
                />
              </svg>
              <div>
                <strong>
                  {weekly.length}
                  <span> / {goal}</span>
                </strong>
                <small>{t('sessions')}</small>
              </div>
            </div>
            <div className="week-dots">
              {Array.from({ length: 7 }, (_, i) => {
                const d = new Date(weekStart);
                d.setDate(d.getDate() + i);
                const done = completed.some((w) => localDay(new Date(w.startedAt)) === localDay(d));
                return (
                  <div key={i}>
                    <small>{formatDate(d.toISOString(), { weekday: 'narrow' })}</small>
                    <span className={done ? 'done' : ''}>
                      {done ? <Check size={13} /> : <span />}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="center muted">{t('weekHint')}</p>
          </section>
          <section className="panel water-card">
            <div className="section-heading">
              <div className="row">
                <Droplets size={20} />
                <h2>{t('water')}</h2>
              </div>
              <span className="water-spark">✦</span>
            </div>
            <div className="water-total">
              {number(water / 1000)}
              <small>{t('liters')}</small>
            </div>
            <div className="water-wave" />
            <p>{t('waterHint')}</p>
            <button
              className="button water-button full"
              onClick={() => run('water', { ml: 250, date: localDay() }, true).catch(() => {})}
            >
              <Plus size={16} />
              {t('addWater')}
            </button>
          </section>
          {!coach && (
            <section className="panel coach-note">
              <span className="eyebrow">{t('coachNote')}</span>
              <div className="row">
                <span className="avatar">
                  <MessageSquare size={17} />
                </span>
                <div>
                  <strong>{t('coachMessage')}</strong>
                  <small>{t('messages')}</small>
                </div>
              </div>
              <button className="text-button" onClick={() => navigate('messages')}>
                {t('openMessages')}
                <ArrowUpRight size={15} />
              </button>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
function UtensilIcon() {
  return <Leaf size={18} />;
}
function Stat({
  icon,
  label,
  value,
  suffix,
  detail,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix: string;
  detail: string;
  color: string;
}) {
  return (
    <div className="stat-card panel">
      <div className="row between">
        <span className={`tile-icon ${color}`}>{icon}</span>
        <span className="stat-period">{detail}</span>
      </div>
      <p>{label}</p>
      <div className="stat-value">
        {value}
        <small>{suffix}</small>
      </div>
    </div>
  );
}
/** Branded card for the client's active coach: logo, welcome note, contact and messages. */
export function CoachHero({ link: coach }: { link: Relationship }) {
  const { state, t, navigate } = useNutri();
  // The coach's card is theirs, so it wears their brand color (contrast-adjusted for the theme).
  const tokens = coachBrandStyle(state, coach.coach.id);
  return (
    <section
      className={`panel coach-hero ${coach.coach.branding?.backgroundAt ? 'has-background' : ''}`}
      aria-label={t('connectedCoach')}
      style={
        {
          ...tokens,
          '--brand': 'var(--green)',
          ...(coach.coach.branding?.backgroundAt && {
            '--brand-background': `url("${brandBackgroundUrl(coach.coach.id, coach.coach.branding.backgroundAt)}")`,
          }),
        } as CSSProperties
      }
    >
      <BrandMark
        coachId={coach.coach.id}
        name={coach.coach.name}
        branding={coach.coach.branding}
        className="coach-hero-logo"
      />
      <div className="coach-hero-body">
        <span className="eyebrow">{t('connectedCoach')}</span>
        <h2>{coach.coach.branding?.businessName || coach.coach.name}</h2>
        {coach.coach.branding?.businessName &&
          coach.coach.branding.businessName !== coach.coach.name && (
            <small className="coach-hero-name">{coach.coach.name}</small>
          )}
        {coach.coach.branding?.welcome && (
          <p className="coach-hero-welcome">{coach.coach.branding.welcome}</p>
        )}
        <CoachContact coach={coach.coach} />
      </div>
      <button className="button primary coach-hero-cta" onClick={() => navigate('messages')}>
        <MessageSquare size={16} />
        {t('openMessages')}
      </button>
    </section>
  );
}
/** The client's coach profile, opened from the coach card in the sidebar. */
export function CoachView() {
  const { state, t } = useNutri();
  const link = state.relationships.find(
    (l) => l.clientId === state.user.id && l.status === 'ACTIVE',
  );
  return (
    <>
      <PageHeading title={t('connectedCoach')} />
      {link ? <CoachHero link={link} /> : <Empty text={t('noCoach')} />}
    </>
  );
}
export function ProgressView({ reports = false }: { reports?: boolean }) {
  const { state, t, formatDate, number, navigate } = useNutri();
  const workouts = state.workouts
    .filter((w) => w.status === 'FINISHED')
    .slice()
    .reverse();
  const data = workouts
    .filter((w) => w.sets.some((s) => s.completed))
    .map((w) => ({
      date: formatDate(w.startedAt, { month: 'short', day: 'numeric' }),
      volume: w.sets.filter((s) => s.completed).reduce((n, s) => n + s.reps * s.weight, 0),
    }));
  return (
    <>
      <PageHeading
        title={t(reports ? 'reports' : 'progress')}
        subtitle={t(reports ? 'reportsSub' : 'progressSub')}
      >
        <a className="button secondary" href="/api/export">
          {t('download')}
          <ArrowUpRight size={16} />
        </a>
      </PageHeading>
      <WeightProgress />
      <div className="stats-grid">
        <Stat
          icon={<TrendingUp size={18} />}
          label={t('volume')}
          value={number(data.reduce((sum, workout) => sum + workout.volume, 0))}
          suffix={t('kg')}
          detail={t('history')}
          color="green"
        />
        <Stat
          icon={<Dumbbell size={18} />}
          label={t('workoutCount')}
          value={number(workouts.length)}
          suffix={t('sessions')}
          detail={t('total')}
          color="green"
        />
        <Stat
          icon={<Flame size={18} />}
          label={t('personalBest')}
          value={number(
            Math.max(
              0,
              ...workouts.flatMap((w) => w.sets.filter((s) => s.completed).map((s) => s.weight)),
            ),
          )}
          suffix={t('kg')}
          detail={t('history')}
          color="orange"
        />
      </div>
      <div>
        <section className="panel">
          <div className="section-heading">
            <h2>{t('strengthTrend')}</h2>
          </div>
          <p className="muted small-copy">{t('trainingVolumeHint')}</p>
          {data.length ? (
            <div className="chart tall">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 4" stroke="var(--line)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} width={40} />
                  <Tooltip
                    contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
                  />
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="volume"
                    name={t('volume')}
                    stroke="#27836b"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty text={t('noTrainingDataYet')} />
          )}
        </section>
      </div>
      <section className="panel calendar-heatmap">
        <div className="section-heading">
          <h2>{t('trainingDays')}</h2>
          <span className="muted">{t('month')}</span>
        </div>
        <div className="heatmap">
          {Array.from({ length: 35 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - 34 + i);
            const count = workouts.filter(
              (w) => localDay(new Date(w.startedAt)) === localDay(d),
            ).length;
            return (
              <div
                key={i}
                className={count ? 'heat active' : 'heat'}
                title={`${formatDate(d.toISOString())}: ${count} ${t('sessions')}`}
              >
                <span>{d.getDate()}</span>
                {count > 0 && <Check size={13} />}
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <PersonalRecords compact />
      </section>
      <ProgressPhotos />
      <section className="panel">
        <h2>{t('history')}</h2>
        {workouts.length ? (
          <div className="record-list">
            {workouts
              .slice()
              .reverse()
              .map((w) => (
                <div key={w.id} className="list-row">
                  <span className="tile-icon">
                    <Dumbbell size={17} />
                  </span>
                  <div className="grow">
                    <button
                      className="text-button"
                      onClick={() => navigate(`active?summary=${w.id}`)}
                    >
                      {w.name}
                    </button>
                    <small>
                      {formatDate(w.startedAt, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </small>
                  </div>
                  <span className="badge">
                    {w.sets.filter((s) => s.completed).length} {t('sets')}
                  </span>
                  <span>
                    {w.sets.some((s) => s.completed)
                      ? `${number(
                          w.sets
                            .filter((s) => s.completed)
                            .reduce((n, s) => n + s.reps * s.weight, 0),
                        )} ${t('kg')}`
                      : t('noCompletedSets')}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <Empty text={t('noWorkoutsYet')} />
        )}
      </section>
    </>
  );
}
