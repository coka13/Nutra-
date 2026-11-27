'use client';
import { coachBrandStyle } from '@/lib/brand-theme';
import { useEffect, useState, type FocusEvent, type MouseEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { currentWorkout, workoutMillis } from '@/lib/workout-clock';
import {
  estimateMinutes,
  parseDays,
  repsLabel,
  supersetLabels,
  targetMuscles,
  totalSets,
} from '@/lib/workout-plan';
import { useWeekdays } from './workout-builder';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Dumbbell,
  LayoutTemplate,
  Link2,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  StickyNote,
  Target,
  Timer,
  Trash2,
} from 'lucide-react';
import { ExerciseTechnique } from './exercise-details';
import { ExerciseCatalog } from './exercise-catalog';
export { BuilderView } from './workout-builder';
import type { Exercise } from '@prisma/client';
import type { Program, Workout } from '@/lib/types';
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
  const { state, library, t, navigate, run, formatDate } = useNutri();
  const [confirm, setConfirm] = useState<Program | null>(null),
    [query, setQuery] = useState(''),
    [scope, setScope] = useState('all'),
    [assigning, setAssigning] = useState<Program | null>(null);
  const isCoach = state.user.role === 'COACH';
  const week = useWeekdays();
  const clients = state.relationships.filter(
    (r) => r.coachId === state.user.id && r.status === 'ACTIVE',
  );
  const muscleOf = new Map(library.exercises.map((exercise) => [exercise.id, exercise.muscle]));
  const owned = (p: Program) => p.ownerId === state.user.id;
  const scopedClient = isCoach && scope !== 'all' && scope !== 'templates' ? scope : null;
  const programs = state.programs.filter(
    (p) =>
      (!isCoach || owned(p)) &&
      (scope === 'all' || (scope === 'templates' ? p.template : p.assignedClientId === scope)) &&
      p.name.toLowerCase().includes(query.toLowerCase()),
  );
  const active = currentWorkout(state.workouts);
  async function duplicate(p: Program) {
    await run('programs/duplicate', {
      id: p.id,
      name: `${p.name} · ${t('wbCopySuffix')}`.slice(0, 200),
    });
  }
  async function start(p: Program) {
    try {
      const workout = (await run('workouts/start', { programId: p.id }, true)) as { id: string };
      navigate(`active?session=${workout.id}`);
    } catch {}
  }
  function createLink() {
    const params = new URLSearchParams();
    if (scopedClient) params.set('client', scopedClient);
    if (scope === 'templates') params.set('template', '1');
    const search = params.toString();
    return search ? `builder?${search}` : 'builder';
  }
  return (
    <>
      <PageHeading
        title={t(isCoach ? 'workoutPlans' : 'workouts')}
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
        <button className="button primary wb-create" onClick={() => navigate(createLink())}>
          <Plus size={17} />
          {t('newProgram')}
        </button>
      </PageHeading>
      {!isCoach && active && <ContinueWorkoutPrompt key={active.id} workout={active} />}
      {!isCoach && active && <ActiveWorkoutBanner workout={active} />}
      {isCoach && (
        <div className="wb-scope" role="group" aria-label={t('wbShowing')}>
          {['all', 'templates'].map((key) => (
            <button
              key={key}
              type="button"
              className={`wb-chip ${scope === key ? 'active' : ''}`}
              aria-pressed={scope === key}
              onClick={() => setScope(key)}
            >
              {key === 'templates' && <LayoutTemplate size={14} />}
              {t(key === 'all' ? 'wbAllWorkouts' : 'templates')}
            </button>
          ))}
          {clients.length > 0 && (
            <select
              className={scopedClient ? 'active' : ''}
              aria-label={t('wbTraineeSchedule')}
              value={scopedClient || ''}
              onChange={(e) => setScope(e.target.value || 'all')}
            >
              <option value="">{t('wbTraineeSchedule')}</option>
              {clients.map((r) => (
                <option key={r.id} value={r.clientId}>
                  {r.client.name}
                </option>
              ))}
            </select>
          )}
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
      <div className={`program-grid${isCoach ? ' coach-program-grid' : ''}`}>
        {programs.map((p, i) => {
          const muscles = targetMuscles(
            p.exercises,
            (id) =>
              muscleOf.get(id) ?? p.exercises.find((row) => row.exerciseId === id)?.exercise.muscle,
          );
          return (
            <article
              className="panel program-card"
              key={p.id}
              style={coachBrandStyle(state, p.ownerId)}
            >
              <div className={`program-art art-${i % 3}`}>
                <Dumbbell size={65} strokeWidth={1} />
                <span aria-hidden="true">N+ / {String(i + 1).padStart(2, '0')}</span>
                <span className="badge program-day-label">
                  <CalendarDays size={15} aria-hidden="true" />
                  {week.list(parseDays(p.days)) || t('unscheduled')}
                </span>
              </div>
              <div className="program-info">
                <div className="row between">
                  <span className="eyebrow">
                    {t(
                      !owned(p)
                        ? 'coachAssigned'
                        : p.template
                          ? 'templates'
                          : isCoach
                            ? 'savedWorkout'
                            : 'training',
                    )}
                  </span>
                  {owned(p) && (
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
                  <span>
                    {totalSets(p.exercises)} {t('wbSetsLower')}
                  </span>
                  <span>
                    <Clock size={14} />~{estimateMinutes(p.exercises)} {t('wbMin')}
                  </span>
                </div>
                {muscles.length > 0 && (
                  <p className="program-muscles">
                    {muscles
                      .slice(0, 3)
                      .map((muscle) => t(muscle))
                      .join(' · ')}
                  </p>
                )}
                <div className="row program-actions">
                  {isCoach ? (
                    <button className="button primary grow" onClick={() => setAssigning(p)}>
                      {t('assignTo')}
                    </button>
                  ) : (
                    <button className="button primary grow" onClick={() => start(p)}>
                      <Play size={15} />
                      {t('startWorkout')}
                    </button>
                  )}
                  {owned(p) && p.template && (
                    <button
                      className="button secondary"
                      onClick={() => navigate(`builder?from=${encodeURIComponent(p.id)}`)}
                    >
                      {t(isCoach ? 'wbCustomizeForTrainee' : 'wbUseTemplate')}
                    </button>
                  )}
                  {owned(p) && (
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
          );
        })}
      </div>
      {!programs.length && (
        <Empty text={t(query ? 'noResults' : 'emptyPrograms')}>
          <button className="button primary" onClick={() => navigate(createLink())}>
            <Plus size={16} /> {t('newProgram')}
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
        <Modal title={t('remove')} role="alertdialog" onClose={() => setConfirm(null)}>
          <p className="confirm-subject">{confirm.name}</p>
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={() => setConfirm(null)}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="button danger"
              onClick={async () => {
                try {
                  await run('programs/delete', { id: confirm.id });
                  setConfirm(null);
                } catch {}
              }}
            >
              <Trash2 size={16} aria-hidden="true" />
              {t('remove')}
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
  // One block per plan entry, in plan order: the same exercise may appear more than once.
  const blocks = setBlocks(w.sets);
  const deadline = w.restUntil ? +new Date(w.restUntil) : null;
  const time = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : w.restRemaining;
  const elapsed = Math.floor(workoutMillis(w, now) / 1000);
  // Exercises stay in place and may be done in any order; the current one is the block the
  // trainee last worked on while it still has sets left, otherwise the first unfinished block.
  const [touched, setTouched] = useState<string | null>(null);
  const currentBlock =
    blocks.find((block) => block.key === touched && block.sets.some((set) => !set.completed)) ??
    blocks.find((block) => block.sets.some((set) => !set.completed));
  const current = currentBlock?.sets.find((set) => !set.completed);
  // Each call carries a timestamp so repeated taps (+15, +15) are not merged as duplicates.
  const rest = (action: string, restSetId?: string) =>
    run('workouts/update', { id: w.id, rest: action, restSetId, at: Date.now() }, true).catch(
      () => {},
    );
  // The plan behind this session: rep ranges, the author's notes and supersets.
  const planRows = w.program?.exercises ?? [];
  const planSupersets = supersetLabels(planRows);
  const planFor = (position: number, exerciseId: string) => {
    const index = planRows.findIndex(
      (row) => row.position === position && row.exerciseId === exerciseId,
    );
    return index < 0 ? null : { row: planRows[index], superset: planSupersets[index] };
  };
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
          {current && currentBlock && (
            <small>
              {t('sets')} {current.setIndex + 1} / {currentBlock.sets.length}
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
        <div className="rest-timer" role="timer" aria-live="off" data-testid="rest-timer">
          <div className="rest-timer-clock">
            <Timer size={20} aria-hidden="true" />
            <span>{t('timer')}</span>
            <strong dir="ltr">
              {Math.floor(time / 60)}:{String(time % 60).padStart(2, '0')}
            </strong>
          </div>
          <div className="rest-timer-actions">
            <button
              className="button secondary"
              aria-label={`-15 ${t('secondsShort')}`}
              onClick={() => rest('reduce')}
            >
              <span dir="ltr">−15</span>
            </button>
            <button
              className="button secondary"
              aria-label={`+15 ${t('secondsShort')}`}
              onClick={() => rest('extend')}
            >
              <span dir="ltr">+15</span>
            </button>
            <button
              className="button secondary"
              disabled={w.status === 'PAUSED'}
              aria-label={t(deadline ? 'pause' : 'resume')}
              onClick={() => rest(deadline ? 'pause' : 'resume')}
            >
              {deadline ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button className="button secondary" onClick={() => rest('skip')}>
              {t('skip')}
            </button>
          </div>
        </div>
      )}
      <div className={`active-workout-list ${time > 0 ? 'with-rest-timer' : ''}`}>
        {blocks.map(({ key, position, exerciseId, sets }) => {
          const exercise = sets[0].exercise;
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
          const plan = planFor(position, exerciseId);
          return (
            <section
              className={`panel active-exercise ${currentBlock?.key === key ? 'current-exercise' : ''}`}
              key={key}
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
                    {plan && (plan.superset || plan.row.repsMax > 0) && (
                      <div className="live-plan-tags">
                        {plan.superset && (
                          <span className="badge">
                            <Link2 size={12} /> {t('wbSuperset')} {plan.superset}
                          </span>
                        )}
                        {plan.row.repsMax > 0 && (
                          <span className="badge neutral">
                            <Target size={12} /> {plan.row.sets} × {repsLabel(plan.row)}{' '}
                            {t('reps').toLowerCase()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <button className="text-button" onClick={() => setInstruction(exercise)}>
                  {t('instructions')}
                  <ArrowUpRight size={16} />
                </button>
              </div>
              {plan?.row.notes && (
                <p className="live-plan-note">
                  <StickyNote size={14} aria-hidden="true" /> {plan.row.notes}
                </p>
              )}
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
                <ExerciseSets session={w} sets={sets} onTouch={() => setTouched(key)} />
              </div>
              {sets[0].restSeconds > 0 && (
                <button
                  className="text-button"
                  disabled={w.status === 'PAUSED'}
                  onClick={() => {
                    setTouched(key);
                    rest('start', sets[0].id);
                  }}
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
/** Live card for a workout in progress, shown above the workout list. */
function ActiveWorkoutBanner({ workout }: { workout: Workout }) {
  const { t, navigate } = useNutri();
  const [now, setNow] = useState(() => Date.now());
  const running = workout.status === 'ACTIVE';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const done = workout.sets.filter((set) => set.completed).length;
  const total = workout.sets.length;
  const open = () => navigate(`active?session=${encodeURIComponent(workout.id)}`);
  return (
    <section
      className={`active-workout-banner ${running ? 'running' : 'paused'}`}
      role="status"
      onClick={open}
    >
      <span className="live-dot" aria-hidden="true" />
      <div className="grow">
        <small>{t(running ? 'workoutInProgress' : 'workoutPaused')}</small>
        <strong>{workout.name}</strong>
        {total > 0 && (
          <div className="active-workout-progress" aria-label={`${done}/${total}`}>
            <span style={{ width: `${Math.round((done / total) * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="active-workout-meta">
        <strong dir="ltr">{clock(Math.floor(workoutMillis(workout, now) / 1000))}</strong>
        {total > 0 && (
          <small dir="ltr">
            {done}/{total} {t('sets')}
          </small>
        )}
      </div>
      <button
        className="button primary"
        onClick={(event) => {
          event.stopPropagation();
          open();
        }}
      >
        <Play size={16} />
        {t(running ? 'backToWorkout' : 'resume')}
      </button>
    </section>
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

type LiveSet = Workout['sets'][number];
/** Groups a session's sets by plan entry (position + exercise), in plan order. */
function setBlocks(sets: LiveSet[]) {
  const blocks = new Map<
    string,
    { key: string; position: number; exerciseId: string; sets: LiveSet[] }
  >();
  for (const set of [...sets].sort((a, b) => a.position - b.position || a.setIndex - b.setIndex)) {
    const key = `${set.position}:${set.exerciseId}`;
    const block = blocks.get(key);
    if (block) block.sets.push(set);
    else blocks.set(key, { key, position: set.position, exerciseId: set.exerciseId, sets: [set] });
  }
  return [...blocks.values()];
}
type SetDraft = { weight: string; reps: string };
/** Accepts both "62.5" and "62,5" (keyboards that use a decimal comma). */
function parseDecimal(value: string) {
  const text = value.trim().replace(',', '.');
  return text === '' || !/^\d*\.?\d*$/.test(text) || text === '.' ? NaN : Number(text);
}
function draftValues(draft: SetDraft) {
  const weight = parseDecimal(draft.weight);
  const reps = parseDecimal(draft.reps);
  return {
    weight,
    reps,
    valid: weight >= 0 && weight <= 1000 && Number.isInteger(reps) && reps >= 0 && reps <= 100,
  };
}
/**
 * The set table of one exercise. Editing the weight or reps of a set carries the new value to the
 * remaining (not yet completed) sets below it. Unsaved edits survive a reload via localStorage.
 */
function ExerciseSets({
  session,
  sets,
  onTouch,
}: {
  session: Workout;
  sets: LiveSet[];
  onTouch: () => void;
}) {
  const { t, run, state } = useNutri();
  const keyOf = (setId: string) => `nutri-set:${state.user.id}:${session.id}:${setId}`;
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>(() => {
    const restored: Record<string, SetDraft> = {};
    if (typeof window === 'undefined') return restored;
    for (const set of sets)
      try {
        const saved = localStorage.getItem(keyOf(set.id));
        if (!saved) continue;
        const { weight, reps } = JSON.parse(saved) as { weight: unknown; reps: unknown };
        restored[set.id] = { weight: String(weight ?? set.weight), reps: String(reps ?? set.reps) };
      } catch {}
    return restored;
  });
  const [busy, setBusy] = useState<string | null>(null);
  // Once the server holds the same values (e.g. after carrying them forward), the draft is spent.
  const serverValues = sets.map((set) => `${set.id}:${set.weight}:${set.reps}`).join('|');
  useEffect(() => {
    setDrafts((current) => {
      let changed = false;
      const next = { ...current };
      for (const set of sets) {
        const draft = next[set.id];
        if (!draft) continue;
        const values = draftValues(draft);
        if (values.weight === set.weight && values.reps === set.reps) {
          delete next[set.id];
          changed = true;
          try {
            localStorage.removeItem(keyOf(set.id));
          } catch {}
        }
      }
      return changed ? next : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverValues]);
  const valueOf = (set: LiveSet): SetDraft =>
    drafts[set.id] ?? { weight: String(set.weight), reps: String(set.reps) };
  function change(set: LiveSet, field: keyof SetDraft, value: string) {
    onTouch();
    const next = { ...drafts };
    for (const row of sets)
      if (row.id === set.id || (!row.completed && row.setIndex > set.setIndex)) {
        next[row.id] = { ...valueOf(row), [field]: value };
        try {
          localStorage.setItem(keyOf(row.id), JSON.stringify(next[row.id]));
        } catch {}
      }
    setDrafts(next);
  }
  async function commit(set: LiveSet, completed: boolean) {
    const { weight, reps, valid } = draftValues(valueOf(set));
    if (!valid) return;
    onTouch();
    setBusy(set.id);
    try {
      await run(
        'workouts/update',
        { id: session.id, set: { id: set.id, weight, reps, completed } },
        true,
      );
      try {
        localStorage.removeItem(keyOf(set.id));
      } catch {}
      setDrafts(({ [set.id]: _done, ...rest }) => rest);
    } finally {
      setBusy(null);
    }
  }
  const locked = session.status === 'PAUSED';
  const select = {
    onFocus: (event: FocusEvent<HTMLInputElement>) => event.currentTarget.select(),
    onClick: (event: MouseEvent<HTMLInputElement>) => event.currentTarget.select(),
    onMouseUp: (event: MouseEvent<HTMLInputElement>) => event.preventDefault(),
  };
  return (
    <>
      {sets.map((set) => {
        const draft = valueOf(set);
        const values = draftValues(draft);
        const hasUnsavedChanges =
          values.weight !== set.weight || values.reps !== set.reps || !values.valid;
        const disabled = locked || busy === set.id;
        return (
          <form
            key={set.id}
            noValidate
            className={`set-row ${set.completed ? 'set-done' : ''}`}
            onSubmit={(e) => {
              e.preventDefault();
              commit(set, !set.completed || hasUnsavedChanges).catch(() => {});
            }}
          >
            <span>{set.setIndex + 1}</span>
            <input
              aria-label={t('weight')}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              dir="ltr"
              value={draft.weight}
              aria-invalid={!(values.weight >= 0 && values.weight <= 1000)}
              {...select}
              onChange={(e) => change(set, 'weight', e.target.value)}
              disabled={disabled}
            />
            <input
              aria-label={t('reps')}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              dir="ltr"
              value={draft.reps}
              aria-invalid={
                !(Number.isInteger(values.reps) && values.reps >= 0 && values.reps <= 100)
              }
              {...select}
              onChange={(e) => change(set, 'reps', e.target.value)}
              disabled={disabled}
            />
            <button
              className={`set-check ${set.completed ? 'checked' : ''}`}
              aria-label={t(set.completed && hasUnsavedChanges ? 'save' : 'completed')}
              aria-pressed={set.completed}
              disabled={disabled || !values.valid}
            >
              <Check size={17} />
            </button>
          </form>
        );
      })}
    </>
  );
}
