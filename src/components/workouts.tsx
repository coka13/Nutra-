'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { currentWorkout, workoutMillis } from '@/lib/workout-clock';
import { exerciseGroups } from '@/lib/exercise-groups';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  Dumbbell,
  GripVertical,
  Pause,
  Play,
  Plus,
  Search,
  Square,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { ExerciseTechnique } from './exercise-details';
import { ExerciseCatalog } from './exercise-catalog';
import type { Exercise } from '@prisma/client';
import type { Program, ProgramDraft, Workout } from '@/lib/types';
import { Empty, Form, Modal, PageHeading, Submit, useNutri } from './workspace';
function name(e: Exercise, lang: string) {
  return lang === 'he' ? e.nameHe : e.nameEn;
}
function ContinueWorkoutPrompt({ workout }: { workout: Workout }) {
  const { t, run, navigate } = useNutri();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <Modal title={t('continueWorkoutTitle')} onClose={() => setDismissed(true)}>
      <p>{t('continueWorkoutHint')}</p>
      <p>
        <strong>{workout.name}</strong>
      </p>
      <Form
        onSubmit={async () => {
          if (workout.status === 'PAUSED') {
            await run('workouts/update', { id: workout.id, status: 'ACTIVE' }, true);
          }
          navigate(`active?session=${encodeURIComponent(workout.id)}`);
        }}
      >
        <div className="row wrap">
          <Submit>{t('resume')}</Submit>
          <button type="button" className="button secondary" onClick={() => setDismissed(true)}>
            {t('browseWorkouts')}
          </button>
        </div>
      </Form>
    </Modal>
  );
}
export function WorkoutsView() {
  const { state, t, lang, navigate, run, formatDate } = useNutri();
  const [confirm, setConfirm] = useState<Program | null>(null),
    [query, setQuery] = useState(''),
    [weekday, setWeekday] = useState<number | null>(null);
  const isCoach = state.user.role === 'COACH';
  const [assigning, setAssigning] = useState<Program | null>(null);
  const clients = state.relationships.filter(
    (r) => r.coachId === state.user.id && r.status === 'ACTIVE',
  );
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  const weekOrder = lang === 'he' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  const weekdayDate = (day: number) => new Date(Date.UTC(2024, 0, 7 + day));
  const shortDay = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const longDay = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  const dayList = new Intl.ListFormat(locale);
  const programs = state.programs.filter(
    (p) =>
      (!isCoach || p.ownerId === state.user.id) &&
      (weekday === null || p.days.split(',').includes(String(weekday))) &&
      p.name.toLowerCase().includes(query.toLowerCase()),
  );
  const active = currentWorkout(state.workouts);
  async function duplicate(p: Program) {
    await run('programs/save', {
      name: `${p.name} · ${t('duplicate')}`,
      description: p.description,
      weeks: 0,
      days: p.days,
      template: p.template,
      assignedClientId: null,
      exercises: p.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        sets: e.sets,
        reps: e.reps,
        rest: e.rest,
        weight: e.weight,
        group: e.group,
      })),
    });
  }
  return (
    <>
      <PageHeading
        title={t(
          state.user.role === 'COACH' ? 'workoutPlans' : 'workouts',
        )}
        subtitle={t(isCoach ? 'coachProgramsSub' : 'programsSub')}
      >
        {!isCoach && (
          <button
            className="button secondary"
            title={t('guidedHint')}
            onClick={() => run('programs/generate', {}).catch(() => {})}
          >
            {t('smartSchedule')}
          </button>
        )}
        <button className="button primary" onClick={() => navigate('builder')}>
          <Plus size={17} />
          {t('newProgram')}
        </button>
      </PageHeading>
      {!isCoach && active && (
        <ContinueWorkoutPrompt key={active.id} workout={active} />
      )}
      {!isCoach && active && (
        <div className="onboarding-banner">
          <span>
            <Dumbbell size={18} />
            {active.name}
          </span>
          <button
            className="text-button"
            onClick={() => navigate(`active?session=${encodeURIComponent(active.id)}`)}
          >
            {t('resume')} →
          </button>
        </div>
      )}
      <div className="toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
          />
        </div>
        <button className="button secondary" onClick={() => navigate('library')}>
          {t('library')}
          <ArrowUpRight size={16} />
        </button>
      </div>
      {!isCoach && (
        <section className="panel">
          <div className="section-heading">
            <h2>{t('scheduledWorkouts')}</h2>
          </div>
          <div className="day-picker" aria-label={t('scheduledWorkouts')}>
            <button
              className={weekday === null ? 'picked' : ''}
              type="button"
              aria-pressed={weekday === null}
              onClick={() => setWeekday(null)}
            >
              {t('all')}
            </button>
            {weekOrder.map((day) => (
              <button
                key={day}
                type="button"
                className={weekday === day ? 'picked' : ''}
                aria-pressed={weekday === day}
                onClick={() => setWeekday(day)}
              >
                {shortDay.format(weekdayDate(day))}
              </button>
            ))}
          </div>
          {weekday !== null && !query && !programs.length && (
            <p className="muted">{t('restDay')}</p>
          )}
        </section>
      )}
      <div className={`program-grid${isCoach ? ' coach-program-grid' : ''}`}>
        {programs.map((p, i) => (
          <article className="panel program-card" key={p.id}>
            <div className={`program-art art-${i % 3}`}>
              <Dumbbell size={65} strokeWidth={1} />
              <span>N+ / {String(i + 1).padStart(2, '0')}</span>
              <span className="badge program-day-label">
                <CalendarDays size={15} aria-hidden="true" />
                {dayList.format(
                  weekOrder
                    .filter((day) => p.days.split(',').includes(String(day)))
                    .map((day) => longDay.format(weekdayDate(day))),
                ) || t('unscheduled')}
              </span>
            </div>
            <div className="program-info">
              <div className="row between">
                <span className="eyebrow">
                  {t(
                    p.ownerId !== state.user.id
                      ? 'coachAssigned'
                      : p.template
                        ? 'templates'
                        : isCoach
                          ? 'savedWorkout'
                          : 'training',
                  )}
                </span>
                {p.ownerId === state.user.id && (
                  <div className="row">
                    <button
                      className="icon-btn"
                      aria-label={t('duplicate')}
                      onClick={() => duplicate(p).catch(() => {})}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={t('remove')}
                      onClick={() => setConfirm(p)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
              <h2>{p.name}</h2>
              <p>{p.description}</p>
              {isCoach && (
                <p className="program-assignee">
                  {p.assignedClientId
                    ? clients.find((r) => r.clientId === p.assignedClientId)?.client.name ||
                      t('assignTo')
                    : t('workoutNotAssigned')}
                </p>
              )}
              <div className="program-meta">
                <span>
                  <Dumbbell size={14} />
                  {p.exercises.length} {t('exercises')}
                </span>
              </div>
              <div className="row program-actions">
                {isCoach ? (
                  <button className="button primary grow" onClick={() => setAssigning(p)}>
                    {t('assignTo')}
                  </button>
                ) : (
                  <button
                    className="button primary grow"
                    onClick={async () => {
                      try {
                        const workout = (await run(
                          'workouts/start',
                          { programId: p.id },
                          true,
                        )) as {
                          id: string;
                        };
                        navigate(`active?session=${workout.id}`);
                      } catch {}
                    }}
                  >
                    <Play size={15} />
                    {t('startWorkout')}
                  </button>
                )}
                {p.ownerId === state.user.id && (
                  <button
                    className="button secondary"
                    onClick={() => navigate(`builder?id=${p.id}`)}
                  >
                    {t('edit')}
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!programs.length && (
        <Empty text={t('emptyPrograms')}>
          <button className="button primary" onClick={() => navigate('builder')}>
            {t('newProgram')}
          </button>
        </Empty>
      )}
      {!isCoach && (
        <section className="panel">
          <div className="section-heading">
            <h2>{t('history')}</h2>
            <button className="text-button" onClick={() => navigate('progress')}>
              {t('viewAll')}
              <ChevronRight size={15} />
            </button>
          </div>
          {state.workouts
            .filter((w) => w.status === 'FINISHED')
            .slice(0, 5)
            .map((w) => (
              <div className="list-row" key={w.id}>
                <span className="tile-icon">
                  <Check size={17} />
                </span>
                <div className="grow">
                  <strong>{w.name}</strong>
                  <small>{formatDate(w.startedAt, { day: 'numeric', month: 'long' })}</small>
                </div>
                <span className="badge">{t('completed')}</span>
              </div>
            ))}
        </section>
      )}
      {assigning && (
        <Modal title={t('assignTo')} onClose={() => setAssigning(null)}>
          <p>{assigning.name}</p>
          <p className="muted">{t('assignWorkoutHint')}</p>
          {clients.length ? (
            <Form
              onSubmit={async (f) => {
                await run('programs/assign', {
                  id: assigning.id,
                  assignedClientId: String(f.get('clientId')),
                });
                setAssigning(null);
              }}
            >
              <label>
                {t('assignTo')}
                <select name="clientId" required defaultValue={assigning.assignedClientId || ''}>
                  <option value="" disabled>
                    {t('assignTo')}
                  </option>
                  {clients.map((r) => (
                    <option key={r.id} value={r.clientId}>
                      {r.client.name}
                    </option>
                  ))}
                </select>
              </label>
              <Submit>{t('assignTo')}</Submit>
            </Form>
          ) : (
            <Empty text={t('noClientsYet')}>
              <button className="button primary" onClick={() => navigate('clients')}>
                {t('manageClients')}
              </button>
            </Empty>
          )}
        </Modal>
      )}
      {confirm && (
        <Modal title={t('remove')} onClose={() => setConfirm(null)}>
          <p>{confirm.name}</p>
          <button
            className="button danger"
            onClick={async () => {
              try {
                await run('programs/delete', { id: confirm.id });
                setConfirm(null);
              } catch {}
            }}
          >
            {t('remove')}
          </button>
        </Modal>
      )}
    </>
  );
}
const fresh: ProgramDraft = {
  name: '',
  description: '',
  weeks: 0,
  days: '1,3,5',
  template: false,
  assignedClientId: null,
  exercises: [],
};
export function BuilderView() {
  const { state, library, lang, t, run, navigate } = useNutri(),
    [draft, setDraft] = useState<ProgramDraft>(fresh),
    [search, setSearch] = useState(''),
    [muscle, setMuscle] = useState('all'),
    [drag, setDrag] = useState<number | null>(null),
    [error, setError] = useState('');
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [selectionOpen, setSelectionOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || !library.exercises.length) return;
    initialized.current = true;
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    const clientId = params.get('client');
    const exercise = library.exercises.find((row) => row.id === params.get('exercise'));
    if (!id && exercise)
      setDraft((current) => ({
        ...current,
        exercises: [{ exerciseId: exercise.id, sets: 3, reps: 10, rest: 60, weight: 0, group: '' }],
      }));
    if (!id && clientId) setDraft((current) => ({ ...current, assignedClientId: clientId }));
    const p = state.programs.find((p) => p.id === id && p.ownerId === state.user.id);
    if (p)
      setDraft({
        id: p.id,
        name: p.name,
        description: p.description,
        weeks: 0,
        days: p.days,
        template: p.template,
        assignedClientId: p.assignedClientId,
        exercises: p.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          sets: e.sets,
          reps: e.reps,
          rest: e.rest,
          weight: e.weight,
          group: e.group,
        })),
      });
  }, [library.exercises, state.programs, state.user.id]);
  function move(from: number, to: number) {
    if (to < 0 || to >= draft.exercises.length) return;
    const next = [...draft.exercises];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setDraft({ ...draft, exercises: next });
  }
  function patch(index: number, key: string, value: number | string) {
    setDraft({
      ...draft,
      exercises: draft.exercises.map((e, i) => (i === index ? { ...e, [key]: value } : e)),
    });
  }
  const filtered = library.exercises.filter(
    (e) =>
      e.hasDemonstration !== false &&
      (muscle === 'all' || e.muscle === muscle) &&
      `${e.nameEn} ${e.nameHe}`
        .toLowerCase()
        .includes(search.toLowerCase().replace(/preacher (chair|bench)/g, 'preacher')),
  );
  return (
    <>
      <PageHeading title={t('builder')} subtitle={t('builderSub')}>
        <button className="button secondary" onClick={() => navigate('workouts')}>
          {t('cancel')}
        </button>
      </PageHeading>
      <Form
        className={`builder-form ${draft.exercises.length ? 'has-selection-tray' : ''}`}
        onSubmit={async () => {
          if (!draft.exercises.length) {
            setError('addExercise');
            throw new Error('addExercise');
          }
          await run('programs/save', draft);
          navigate('workouts');
        }}
      >
        <div className="builder-grid">
          <div className="builder-plan-column">
            <section className="panel builder-details">
              <div className="builder-section-title">
                <span className="builder-heading-icon">
                  <CalendarDays size={19} />
                </span>
                <div>
                  <h2>{t('workoutDetails')}</h2>
                  <p>{t('workoutDetailsHint')}</p>
                </div>
              </div>
              <label>
                {t('name')}
                <input
                  required
                  value={draft.name}
                  maxLength={200}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                {t('description')}
                <textarea
                  rows={2}
                  value={draft.description}
                  maxLength={1000}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </label>
              <div className="form-grid">
                {state.user.role === 'COACH' && (
                  <label>
                    {t('assignTo')}
                    <select
                      value={draft.assignedClientId || ''}
                      onChange={(e) =>
                        setDraft({ ...draft, assignedClientId: e.target.value || null })
                      }
                    >
                      <option value="">{t('unassignedWorkout')}</option>
                      {state.relationships
                        .filter((r) => r.coachId === state.user.id && r.status === 'ACTIVE')
                        .map((r) => (
                          <option key={r.id} value={r.clientId}>
                            {r.client.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
              <label>{t('days')}</label>
              <div className="day-picker">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(2026, 10, 22 + i);
                  return (
                    <button
                      type="button"
                      key={i}
                      aria-pressed={draft.days.split(',').includes(String(i))}
                      className={draft.days.split(',').includes(String(i)) ? 'picked' : ''}
                      onClick={() => {
                        const next = draft.days.split(',').filter(Boolean);
                        const val = String(i);
                        setDraft({
                          ...draft,
                          days: next.includes(val)
                            ? next.filter((n) => n !== val).join(',')
                            : [...next, val].join(','),
                        });
                      }}
                    >
                      {new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en', {
                        weekday: 'short',
                      }).format(d)}
                    </button>
                  );
                })}
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={draft.template}
                  onChange={(e) => setDraft({ ...draft, template: e.target.checked })}
                />
                {t('saveTemplate')}
              </label>
            </section>
            <section className="panel builder-plan">
              <div className="section-heading">
                <h2>
                  {t('yourExercises')}{' '}
                  <span className="builder-count">{draft.exercises.length}</span>
                </h2>
                {!!draft.exercises.length && (
                  <span className="muted builder-set-count">
                    {draft.exercises.reduce((sum, row) => sum + row.sets, 0)} {t('sets')}
                  </span>
                )}
              </div>
              {!draft.exercises.length && (
                <div className="builder-empty">
                  <span className="builder-empty-icon">
                    <Dumbbell size={28} />
                  </span>
                  <h3>{t('startYourWorkout')}</h3>
                  <p>{t('chooseExercisesHint')}</p>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      searchInput.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      searchInput.current?.focus({ preventScroll: true });
                    }}
                  >
                    <Plus size={16} />
                    {t('addExercise')}
                  </button>
                </div>
              )}
              <div className="builder-exercises">
                {draft.exercises.map((row, index) => {
                  const exercise = library.exercises.find((e) => e.id === row.exerciseId);
                  return (
                    <div
                      key={`${row.exerciseId}-${index}`}
                      className="builder-exercise"
                      draggable
                      onDragStart={() => setDrag(index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (drag !== null) move(drag, index);
                        setDrag(null);
                      }}
                    >
                      <div className="section-heading">
                        <div className="row">
                          <GripVertical size={16} className="muted" />
                          <span className="exercise-number">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          {exercise?.demonstration?.poster && (
                            <span className="builder-exercise-thumb">
                              <img src={exercise.demonstration.poster} alt="" loading="lazy" />
                            </span>
                          )}
                          <div>
                            <strong>{exercise ? name(exercise, lang) : ''}</strong>
                            {exercise && (
                              <small className="builder-equipment">{t(exercise.equipment)}</small>
                            )}
                          </div>
                        </div>
                        <div className="row">
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={t('up')}
                            disabled={index === 0}
                            onClick={() => move(index, index - 1)}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={t('down')}
                            disabled={index === draft.exercises.length - 1}
                            onClick={() => move(index, index + 1)}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={t('remove')}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                exercises: draft.exercises.filter((_, i) => i !== index),
                              })
                            }
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="exercise-inputs">
                        {[
                          ['sets', 1, 10],
                          ['reps', 1, 100],
                          ['rest', 0, 600],
                          ['weight', 0, 1000],
                        ].map(([key, min, max]) => (
                          <label key={key}>
                            {t(String(key))}
                            {key === 'weight' ? ` (${t('kg')})` : ''}
                            <input
                              type="number"
                              onFocus={(event) => event.currentTarget.select()}
                              onClick={(event) => event.currentTarget.select()}
                              onMouseUp={(event) => event.preventDefault()}
                              min={min}
                              max={max}
                              step={key === 'weight' ? 0.5 : 1}
                              required
                              value={row[key as 'sets' | 'reps' | 'rest' | 'weight']}
                              onChange={(e) => patch(index, String(key), Number(e.target.value))}
                            />
                          </label>
                        ))}
                      </div>
                      <details className="builder-advanced">
                        <summary>{t('group')}</summary>
                        <label>
                          {t('group')}
                          <input
                            maxLength={40}
                            value={row.group}
                            onChange={(e) => patch(index, 'group', e.target.value)}
                          />
                        </label>
                      </details>
                    </div>
                  );
                })}
              </div>
              {error && <p className="form-error">{t(error)}</p>}
              <div className="form-actions builder-savebar">
                <span className="muted">
                  {draft.exercises.length} {t('exercises')}
                </span>
                <Submit />
              </div>
            </section>
          </div>
          <aside className="panel builder-library">
            <div className="builder-section-title">
              <span className="builder-heading-icon">
                <Search size={19} />
              </span>
              <div>
                <h2>{t('findExercises')}</h2>
                <p>{t('exercisePickerHint')}</p>
              </div>
            </div>
            <div className="search-field">
              <Search size={16} />
              <input
                ref={searchInput}
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setVisibleCounts({});
                }}
                placeholder={t('searchExercises')}
                aria-label={t('searchExercises')}
              />
              {search && (
                <button
                  type="button"
                  className="builder-clear-search"
                  aria-label={t('clearSearch')}
                  onClick={() => {
                    setSearch('');
                    setVisibleCounts({});
                    searchInput.current?.focus();
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <select
              value={muscle}
              aria-label={t('primaryMuscles')}
              onChange={(e) => {
                setMuscle(e.target.value);
                setVisibleCounts({});
              }}
            >
              {['all', ...exerciseGroups].map((k) => (
                <option key={k} value={k}>
                  {t(k)}
                </option>
              ))}
            </select>
            <p className="builder-result-count" role="status">
              {filtered.length.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')}{' '}
              {t('catalogResults')}
            </p>
            {exerciseGroups
              .filter((group) => filtered.some((row) => row.muscle === group))
              .map((group) => (
                <details
                  className="builder-muscle-group"
                  key={group}
                  open={!!search || muscle !== 'all'}
                >
                  <summary>
                    {t(group)}{' '}
                    <span className="muted">
                      ({filtered.filter((row) => row.muscle === group).length})
                    </span>
                  </summary>
                  {filtered
                    .filter((row) => row.muscle === group)
                    .slice(0, visibleCounts[group] || 8)
                    .map((e) => (
                      <button
                        type="button"
                        key={e.id}
                        className="library-add-row"
                        onClick={() => {
                          if (draft.exercises.some((row) => row.exerciseId === e.id)) return;
                          setDraft({
                            ...draft,
                            exercises: [
                              ...draft.exercises,
                              {
                                exerciseId: e.id,
                                sets: 3,
                                reps: 10,
                                rest: 60,
                                weight: 0,
                                group: '',
                              },
                            ],
                          });
                        }}
                        disabled={draft.exercises.some((row) => row.exerciseId === e.id)}
                      >
                        <span className="builder-exercise-thumb">
                          {e.demonstration?.poster ? (
                            <img src={e.demonstration.poster} alt="" loading="lazy" />
                          ) : (
                            <Dumbbell size={17} />
                          )}
                        </span>
                        <span className="grow">
                          <strong>{name(e, lang)}</strong>
                          <small>
                            {t(e.muscle)} · {t(e.equipment)}
                          </small>
                        </span>
                        <span
                          className={`builder-add-icon ${draft.exercises.some((row) => row.exerciseId === e.id) ? 'is-added' : ''}`}
                        >
                          {draft.exercises.some((row) => row.exerciseId === e.id) ? (
                            <Check size={16} />
                          ) : (
                            <Plus size={16} />
                          )}
                        </span>
                      </button>
                    ))}
                  {filtered.filter((row) => row.muscle === group).length >
                    (visibleCounts[group] || 8) && (
                    <button
                      type="button"
                      className="text-button builder-show-more"
                      onClick={() =>
                        setVisibleCounts((counts) => ({
                          ...counts,
                          [group]: (counts[group] || 8) + 12,
                        }))
                      }
                    >
                      {t('showMoreExercises')} <ChevronRight size={14} />
                    </button>
                  )}
                </details>
              ))}
            {!filtered.length && <p>{t('noResults')}</p>}
          </aside>
        </div>
      </Form>
      {draft.exercises.length > 0 && (
        <div className="builder-selection-tray" role="region" aria-label={t('yourExercises')}>
          <button type="button" className="button primary" onClick={() => setSelectionOpen(true)}>
            {t('viewSelectedExercises')}{' '}
            <span className="builder-tray-count">{draft.exercises.length}</span>
          </button>
        </div>
      )}
      {selectionOpen && (
        <Modal
          title={`${t('yourExercises')} (${draft.exercises.length})`}
          onClose={() => setSelectionOpen(false)}
        >
          <div className="builder-selection-review">
            {!draft.exercises.length && <p>{t('addExercise')}</p>}
            {draft.exercises.map((row, index) => {
              const exercise = library.exercises.find((item) => item.id === row.exerciseId);
              return (
                <section className="builder-review-exercise" key={row.exerciseId}>
                  <div className="section-heading">
                    <div className="row">
                      {exercise?.demonstration?.poster && (
                        <span className="builder-exercise-thumb">
                          <img src={exercise.demonstration.poster} alt="" />
                        </span>
                      )}
                      <strong>{exercise ? name(exercise, lang) : ''}</strong>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`${t('remove')} ${exercise ? name(exercise, lang) : ''}`}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          exercises: current.exercises.filter(
                            (item) => item.exerciseId !== row.exerciseId,
                          ),
                        }))
                      }
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <div className="exercise-inputs">
                    {[
                      ['sets', 1, 10],
                      ['reps', 1, 100],
                      ['rest', 0, 600],
                      ['weight', 0, 1000],
                    ].map(([key, min, max]) => (
                      <label key={key}>
                        {t(String(key))}
                        {key === 'weight' ? ` (${t('kg')})` : ''}
                        <input
                          type="number"
                          onFocus={(event) => event.currentTarget.select()}
                          onClick={(event) => event.currentTarget.select()}
                          onMouseUp={(event) => event.preventDefault()}
                          min={min}
                          max={max}
                          step={key === 'weight' ? 0.5 : 1}
                          value={row[key as 'sets' | 'reps' | 'rest' | 'weight']}
                          onChange={(event) =>
                            patch(index, String(key), Number(event.target.value))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </section>
              );
            })}
            <button
              type="button"
              className="button primary builder-review-done"
              onClick={() => setSelectionOpen(false)}
            >
              {t('continueChoosingExercises')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function LibraryView() {
  const { t } = useNutri();
  return (
    <>
      <PageHeading title={t('library')} subtitle={t('libraryFullSub')} />
      <ExerciseCatalog />
    </>
  );
}
export function ActiveView() {
  const { state, t, navigate } = useNutri();
  const params = useSearchParams();
  const requestedId = params.get('session');
  const w = requestedId
    ? state.workouts.find((workout) => workout.id === requestedId && workout.status !== 'FINISHED')
    : currentWorkout(state.workouts);
  const summaryId = params.get('summary');
  const summary = state.workouts.find(
    (workout) => workout.id === summaryId && workout.status === 'FINISHED',
  );
  if (summary) return <WorkoutSummary workout={summary} />;
  if (!w)
    return (
      <>
        <PageHeading title={t('activeWorkout')} />
        <Empty text={t('noActive')}>
          <button className="button primary" onClick={() => navigate('workouts')}>
            {t('workouts')}
          </button>
        </Empty>
      </>
    );
  return <LiveWorkout key={w.id} workout={w} />;
}

function LiveWorkout({ workout: w }: { workout: Workout }) {
  const { state, library, clockObservedAt, recordCelebrationOpen, t, lang, run, navigate } =
    useNutri();
  const [instruction, setInstruction] = useState<Exercise | null>(null);
  const [tick, setTick] = useState(() => performance.now());
  const [finishing, setFinishing] = useState(false);
  const [completionDismissed, setCompletionDismissed] = useState(false);
  const allComplete = w.sets.length > 0 && w.sets.every((set) => set.completed);
  useEffect(() => {
    if (!allComplete) setCompletionDismissed(false);
  }, [allComplete]);
  async function finishWorkout() {
    if (finishing) return;
    setFinishing(true);
    try {
      await run('workouts/update', { id: w.id, status: 'FINISHED' });
      try {
        for (const set of w.sets)
          localStorage.removeItem(`nutri-set:${state.user.id}:${w.id}:${set.id}`);
      } catch {}
      navigate(`active?summary=${w.id}`);
    } catch {
      setFinishing(false);
    }
  }
  useEffect(() => {
    if (w.status !== 'ACTIVE') return;
    const timer = setInterval(() => setTick(performance.now()), 250);
    return () => clearInterval(timer);
  }, [w.status]);
  const now = state.clockAt + Math.max(0, tick - clockObservedAt);
  const completed = w.sets.filter((s) => s.completed).length;
  const ids = Array.from(new Set(w.sets.map((s) => s.exerciseId)));
  const deadline = w.restUntil ? +new Date(w.restUntil) : null;
  const time = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : w.restRemaining;
  const elapsed = Math.floor(workoutMillis(w, now) / 1000);
  const current = w.sets.find((set) => !set.completed);
  const rest = (action: string, restSetId?: string) =>
    run('workouts/update', { id: w.id, rest: action, restSetId }, true).catch(() => {});
  return (
    <>
      <PageHeading
        title={w.name}
        subtitle={`${completed} / ${w.sets.length} ${t('sets')} · ${t(w.status === 'PAUSED' ? 'pause' : 'activeLabel')}`}
      >
        <button
          className="button secondary"
          onClick={() =>
            run(
              'workouts/update',
              { id: w.id, status: w.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' },
              true,
            ).catch(() => {})
          }
        >
          {w.status === 'ACTIVE' ? <Pause size={16} /> : <Play size={16} />}{' '}
          {t(w.status === 'ACTIVE' ? 'pause' : 'resume')}
        </button>
        <button className="button primary" disabled={finishing} onClick={finishWorkout}>
          <Check size={16} />
          {t('finish')}
        </button>
      </PageHeading>
      <div className="panel training-status">
        <div>
          <small>{t('workoutElapsed')}</small>
          <strong dir="ltr" data-testid="workout-elapsed">
            {clock(elapsed)}
          </strong>
        </div>
        <div>
          <small>{t('currentExercise')}</small>
          <strong>{current ? name(current.exercise, lang) : t('allSetsComplete')}</strong>
          {current && (
            <small>
              {t('sets')} {current.setIndex + 1} /{' '}
              {w.sets.filter((set) => set.exerciseId === current.exerciseId).length}
            </small>
          )}
        </div>
      </div>
      {state.notifications.some((item) => item.key === 'newRecord' && item.detail === w.id) && (
        <div className="live-record record-achievement" role="status">
          ★ {t('newRecord')}
        </div>
      )}
      <div
        className="session-progress"
        role="progressbar"
        aria-label={t('progress')}
        aria-valuenow={completed}
        aria-valuemax={w.sets.length}
      >
        <div style={{ width: `${w.sets.length ? (completed / w.sets.length) * 100 : 0}%` }} />
      </div>
      {time > 0 && (
        <div className="rest-timer">
          <Timer size={22} />
          <span>{t('timer')}</span>
          <strong>
            {Math.floor(time / 60)}:{String(time % 60).padStart(2, '0')}
          </strong>
          <button
            className="button secondary"
            disabled={w.status === 'PAUSED'}
            onClick={() => rest(deadline ? 'pause' : 'resume')}
          >
            {t(deadline ? 'pause' : 'resume')}
          </button>
          <button className="button secondary" onClick={() => rest('extend')}>
            +30 {t('secondsShort')}
          </button>
          <button className="button secondary" onClick={() => rest('skip')}>
            {t('skip')}
          </button>
        </div>
      )}
      <div className="active-workout-list">
        {ids.map((exerciseId, i) => {
          const sets = w.sets.filter((s) => s.exerciseId === exerciseId),
            exercise = sets[0].exercise;
          const previous = state.workouts.find(
            (p) =>
              p.status === 'FINISHED' &&
              p.sets.some((s) => s.exerciseId === exerciseId && s.completed),
          );
          const lastSet = [...sets]
            .filter((set) => set.completed)
            .sort((a, b) => b.setIndex - a.setIndex)[0];
          const poster = library.exercises.find((row) => row.id === exerciseId)?.demonstration
            ?.poster;
          return (
            <section
              className={`panel active-exercise ${current?.exerciseId === exerciseId ? 'current-exercise' : ''}`}
              key={exerciseId}
              style={{ order: current?.exerciseId === exerciseId ? -1 : 0 }}
            >
              <div className="section-heading">
                <div className="row">
                  <button
                    type="button"
                    className="workout-exercise-icon"
                    aria-label={`${t('instructions')}: ${name(exercise, lang)}`}
                    onClick={() => setInstruction(exercise)}
                  >
                    {poster && <img src={poster} alt="" loading="lazy" />}
                  </button>
                  <div>
                    <h2>{name(exercise, lang)}</h2>
                    <small className="muted">
                      {t(exercise.muscle)} · {t(exercise.equipment)}
                    </small>
                  </div>
                </div>
                <button className="text-button" onClick={() => setInstruction(exercise)}>
                  {t('instructions')}
                  <ArrowUpRight size={16} />
                </button>
              </div>
              <p className="previous-set">
                {t(lastSet ? 'previousSet' : 'previous')}:{' '}
                {lastSet
                  ? `${lastSet.reps} × ${lastSet.weight} ${t('kg')}`
                  : previous
                    ? previous.sets
                        .filter((s) => s.exerciseId === exerciseId && s.completed)
                        .map((s) => `${s.reps} × ${s.weight} ${t('kg')}`)
                        .join(' / ')
                    : t('noPrevious')}
              </p>
              <div className="set-table">
                <div className="set-table-heading">
                  <span>{t('sets')}</span>
                  <span>
                    {t('weight')} ({t('kg')})
                  </span>
                  <span>{t('reps')}</span>
                  <span>{t('completed')}</span>
                </div>
                {sets
                  .sort((a, b) => a.setIndex - b.setIndex)
                  .map((s) => (
                    <SetRow key={s.id} session={w} set={s} />
                  ))}
              </div>
              {sets[0].restSeconds > 0 && (
                <button
                  className="text-button"
                  disabled={w.status === 'PAUSED'}
                  onClick={() => rest('start', sets[0].id)}
                >
                  <Timer size={16} /> {t('startRest')}
                </button>
              )}
            </section>
          );
        })}
      </div>
      <section className="panel">
        <label>
          {t('workoutNotes')}
          <textarea
            defaultValue={w.notes}
            maxLength={2000}
            onBlur={(e) => {
              if (e.target.value !== w.notes)
                run('workouts/update', { id: w.id, notes: e.target.value }, true).catch(() => {});
            }}
          />
        </label>
      </section>
      {allComplete && !completionDismissed && !recordCelebrationOpen && !instruction && (
        <Modal
          title={t('allSetsComplete')}
          onClose={() => {
            if (!finishing) setCompletionDismissed(true);
          }}
        >
          <p>{t('finishWorkoutPrompt')}</p>
          <div className="row">
            <button className="button primary" disabled={finishing} onClick={finishWorkout}>
              <Check size={16} /> {t('finish')}
            </button>
            <button
              className="button secondary"
              disabled={finishing}
              onClick={() => setCompletionDismissed(true)}
            >
              {t('notYet')}
            </button>
          </div>
        </Modal>
      )}
      {instruction && (
        <Modal
          className="exercise-demo-modal exercise-technique-modal"
          title={name(instruction, lang)}
          onClose={() => setInstruction(null)}
        >
          <ExerciseTechnique exercise={instruction} />
        </Modal>
      )}
    </>
  );
}
function clock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function WorkoutSummary({ workout }: { workout: Workout }) {
  const { t, lang, number, navigate, state } = useNutri();
  const completed = workout.sets.filter((set) => set.completed);
  const personalRecord = state.notifications.some(
    (item) => item.key === 'newRecord' && item.detail === workout.id,
  );
  const exerciseIds = [...new Set(completed.map((set) => set.exerciseId))];
  return (
    <>
      <PageHeading title={t('workoutSummary')} subtitle={workout.name}>
        <button className="button primary" onClick={() => navigate('progress')}>
          {t('progress')}
        </button>
      </PageHeading>
      {personalRecord && (
        <div className="panel record-achievement" role="status">
          ★ {t('newRecord')}
        </div>
      )}
      <div className="panel training-status">
        <div>
          <small>{t('workoutElapsed')}</small>
          <strong dir="ltr">{clock(workout.elapsedSeconds)}</strong>
        </div>
        <div>
          <small>{t('completed')}</small>
          <strong>
            {completed.length} / {workout.sets.length}
          </strong>
        </div>
        <div>
          <small>{t('volume')}</small>
          <strong>
            {number(completed.reduce((sum, item) => sum + item.weight * item.reps, 0))} {t('kg')}
          </strong>
        </div>
      </div>
      {exerciseIds.map((id) => {
        const sets = completed.filter((set) => set.exerciseId === id);
        return (
          <section className="panel" key={id}>
            <h3>{name(sets[0].exercise, lang)}</h3>
            {sets.map((set) => (
              <div className="list-row" key={set.id}>
                <span className="grow">
                  {t('sets')} {set.setIndex + 1}
                </span>
                <span>
                  {set.reps} × {set.weight} {t('kg')}
                </span>
              </div>
            ))}
          </section>
        );
      })}
      {workout.notes && <p className="panel">{workout.notes}</p>}
    </>
  );
}

function SetRow({ session, set }: { session: Workout; set: Workout['sets'][number] }) {
  const { t, run, state } = useNutri();
  const draftKey = `nutri-set:${state.user.id}:${session.id}:${set.id}`;
  const [draft, setDraft] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const { weight, reps } = JSON.parse(saved) as { weight: number; reps: number };
          return { weight, reps };
        }
      } catch {}
    }
    return { weight: set.weight, reps: set.reps };
  });
  const { weight, reps } = draft;
  const hasUnsavedChanges = weight !== set.weight || reps !== set.reps;
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(draftKey)) return;
    } catch {}
    setDraft({ weight: set.weight, reps: set.reps });
  }, [draftKey, set.weight, set.reps]);
  function change(values: Partial<typeof draft>) {
    const next = { ...draft, ...values };
    setDraft(next);
    try {
      localStorage.setItem(draftKey, JSON.stringify(next));
    } catch {}
  }
  async function commit(completed: boolean) {
    setBusy(true);
    try {
      await run(
        'workouts/update',
        {
          id: session.id,
          set: { id: set.id, weight, reps, completed },
        },
        true,
      );
      try {
        localStorage.removeItem(draftKey);
      } catch {}
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={`set-row ${set.completed ? 'set-done' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        commit(!set.completed || hasUnsavedChanges).catch(() => {});
      }}
    >
      <span>{set.setIndex + 1}</span>
      <input
        aria-label={t('weight')}
        type="number"
        min={0}
        max={1000}
        step={0.5}
        value={weight}
        inputMode="decimal"
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.currentTarget.select()}
        onMouseUp={(event) => event.preventDefault()}
        onChange={(e) => change({ weight: Number(e.target.value) })}
        disabled={session.status === 'PAUSED' || busy}
      />
      <input
        aria-label={t('reps')}
        type="number"
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.currentTarget.select()}
        onMouseUp={(event) => event.preventDefault()}
        min={0}
        max={100}
        value={reps}
        onChange={(e) => change({ reps: Number(e.target.value) })}
        disabled={session.status === 'PAUSED' || busy}
      />
      <button
        className={`set-check ${set.completed ? 'checked' : ''}`}
        aria-label={t(set.completed && hasUnsavedChanges ? 'save' : 'completed')}
        aria-pressed={set.completed}
        disabled={session.status === 'PAUSED' || busy}
      >
        <Check size={17} />
      </button>
    </form>
  );
}
