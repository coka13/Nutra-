'use client';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  CalendarDays,
  Check,
  Clock,
  CopyPlus,
  Dumbbell,
  GripVertical,
  Info,
  LayoutTemplate,
  Link2,
  Link2Off,
  ListOrdered,
  Minus,
  Plus,
  Replace,
  RotateCcw,
  Search,
  StickyNote,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { Exercise } from '@prisma/client';
import type { Library, ProgramDraft } from '@/lib/types';
import { exerciseGroups } from '@/lib/exercise-groups';
import {
  PLAN_LIMITS,
  clamp,
  clearStoredDraft,
  draftFromProgram,
  draftHasContent,
  draftStorageKey,
  estimateMinutes,
  linkedWithNext,
  moveExercise,
  newPlanExercise,
  normalizeGroups,
  parseDays,
  readStoredDraft,
  repsLabel,
  restLabel,
  supersetLabels,
  targetMuscles,
  toggleDay,
  toggleSuperset,
  totalSets,
  validatePlan,
  weekOrder,
  writeStoredDraft,
  type PlanExercise,
} from '@/lib/workout-plan';
import { ExerciseTechnique } from './exercise-details';
import { Modal, PageHeading, useNutri } from './workspace';

type LibraryExercise = Library['exercises'][number];
type PickerMode =
  { kind: 'add' } | { kind: 'replace'; index: number } | { kind: 'duplicate'; index: number };

const STEPS = ['wbStepDetails', 'wbStepExercises', 'wbStepReview'] as const;
const NAME_SUGGESTIONS = [
  'wbSuggestPush',
  'wbSuggestPull',
  'wbSuggestLegs',
  'wbSuggestUpper',
  'wbSuggestLower',
  'wbSuggestFull',
] as const;
const PAGE_SIZE = 40;

function exerciseName(e: Pick<Exercise, 'nameEn' | 'nameHe'>, lang: string) {
  return lang === 'he' ? e.nameHe : e.nameEn;
}

/** Weekday names, for any locale, from a fixed Sunday-based reference week. */
export function useWeekdays() {
  const { lang } = useNutri();
  return useMemo(() => {
    const locale = lang === 'he' ? 'he-IL' : 'en-GB';
    const date = (day: number) => new Date(Date.UTC(2024, 0, 7 + day));
    const short = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    const long = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
    return {
      order: weekOrder(lang),
      short: (day: number) => short.format(date(day)),
      long: (day: number) => long.format(date(day)),
      list: (days: number[]) =>
        new Intl.ListFormat(locale).format(
          weekOrder(lang)
            .filter((day) => days.includes(day))
            .map((day) => long.format(date(day))),
        ),
    };
  }, [lang]);
}

const emptyDraft = (days: string): ProgramDraft => ({
  name: '',
  description: '',
  weeks: 0,
  days,
  template: false,
  assignedClientId: null,
  exercises: [],
});

export function BuilderView() {
  const { state, library, lang, t, run, navigate } = useNutri();
  const isCoach = state.user.role === 'COACH';
  const [draft, setDraftState] = useState<ProgramDraft>(() =>
    emptyDraft(String(new Date().getDay())),
  );
  const [step, setStep] = useState(0);
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [technique, setTechnique] = useState<LibraryExercise | null>(null);
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const [restored, setRestored] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [flash, setFlash] = useState<number | null>(null);
  const storageKey = useRef('');
  const original = useRef('');
  const ready = useRef(false);
  const top = useRef<HTMLDivElement>(null);
  const byId = useMemo(
    () => new Map(library.exercises.map((exercise) => [exercise.id, exercise])),
    [library.exercises],
  );
  const clients = state.relationships.filter(
    (r) => r.coachId === state.user.id && r.status === 'ACTIVE',
  );
  const templates = state.programs.filter((p) => p.template && p.ownerId === state.user.id);
  const setDraft = (update: (current: ProgramDraft) => ProgramDraft) => setDraftState(update);

  // Load the workout being edited, a template copy, or URL presets, then any autosaved draft.
  useEffect(() => {
    if (ready.current || !library.exercises.length) return;
    ready.current = true;
    const params = new URLSearchParams(location.search);
    const id = params.get('id') || undefined;
    const owned = state.programs.find((p) => p.id === id && p.ownerId === state.user.id);
    const source = state.programs.find(
      (p) => p.id === params.get('from') && p.ownerId === state.user.id,
    );
    let initial = emptyDraft(String(new Date().getDay()));
    if (owned) initial = draftFromProgram(owned);
    else if (source)
      initial = {
        ...draftFromProgram({ ...source, id: undefined }),
        template: false,
        assignedClientId: null,
      };
    if (!owned) {
      const day = params.get('day');
      if (day && /^[0-6]$/.test(day)) initial.days = day;
      const client = params.get('client');
      if (client && clients.some((r) => r.clientId === client)) initial.assignedClientId = client;
      if (params.get('template') === '1') {
        initial.template = true;
        initial.days = '';
      }
      const exercise = params.get('exercise');
      if (
        exercise &&
        byId.has(exercise) &&
        !initial.exercises.some((r) => r.exerciseId === exercise)
      )
        initial.exercises = [...initial.exercises, newPlanExercise(exercise)];
    }
    storageKey.current = draftStorageKey(state.user.id, owned?.id);
    original.current = JSON.stringify(initial);
    const stored = readStoredDraft(storageKey.current);
    // A URL that asks for something specific (an exercise, a template) wins over a stale draft.
    const specific = !!(params.get('exercise') || source);
    if (stored && !specific && JSON.stringify(stored.draft) !== original.current) {
      setDraftState({
        ...stored.draft,
        exercises: stored.draft.exercises.filter((row) => byId.has(row.exerciseId)),
      });
      setStep(clamp(stored.step, [0, 2]));
      setRestored(stored.savedAt);
    } else {
      setDraftState(initial);
      // Coming from the library with an exercise: show its card first; the name can follow.
      if (params.get('exercise') && initial.exercises.length) setStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.exercises]);

  // Autosave unfinished work locally so nothing is lost when the app is closed.
  useEffect(() => {
    if (!ready.current || !storageKey.current) return;
    const timer = setTimeout(() => {
      const changed = JSON.stringify(draft) !== original.current;
      if (changed && draftHasContent(draft))
        writeStoredDraft(storageKey.current, { draft, step, savedAt: Date.now() });
      else clearStoredDraft(storageKey.current);
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, step]);

  useEffect(() => {
    if (flash === null) return;
    const timer = setTimeout(() => setFlash(null), 1300);
    return () => clearTimeout(timer);
  }, [flash]);

  const issues = validatePlan(draft);
  const stepIssues = (index: number) =>
    issues.filter((issue) =>
      index === 0
        ? issue.field === 'name' || issue.field === 'days'
        : index === 1
          ? issue.field === 'exercises' || /^\d+$/.test(issue.field)
          : true,
    );
  const fieldIssue = (field: string) =>
    [0, 1].some((index) => attempted.has(index) && stepIssues(index).some((i) => i.field === field))
      ? issues.find((issue) => issue.field === field)?.issue
      : undefined;
  const minutes = estimateMinutes(draft.exercises);
  const sets = totalSets(draft.exercises);
  const labels = supersetLabels(draft.exercises);
  const added = new Set(draft.exercises.map((row) => row.exerciseId));

  function goTo(next: number) {
    setStep(next);
    setSaveError('');
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function advance() {
    if (stepIssues(step).length) {
      setAttempted((current) => new Set(current).add(step));
      return;
    }
    goTo(step + 1);
  }
  async function save() {
    if (saving) return;
    if (issues.length) {
      setAttempted(new Set([0, 1]));
      const first = stepIssues(0).length ? 0 : 1;
      if (first !== step) goTo(first);
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await run('programs/save', { ...draft, exercises: normalizeGroups(draft.exercises) });
      clearStoredDraft(storageKey.current);
      navigate('workouts');
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'serverError');
      setSaving(false);
    }
  }
  function patchExercise(index: number, values: Partial<PlanExercise>) {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((row, i) => (i === index ? { ...row, ...values } : row)),
    }));
  }
  function pick(ids: string[]) {
    if (!picker) return;
    setDraft((current) => {
      const exercises = [...current.exercises];
      if (picker.kind === 'add') {
        // An exercise may appear more than once in a workout.
        for (const id of ids) exercises.push(newPlanExercise(id));
      } else if (picker.kind === 'replace') {
        exercises[picker.index] = { ...exercises[picker.index], exerciseId: ids[0] };
      } else {
        exercises.splice(picker.index + 1, 0, newPlanExercise(ids[0], exercises[picker.index]));
      }
      return { ...current, exercises: normalizeGroups(exercises.slice(0, PLAN_LIMITS.exercises)) };
    });
    setFlash(
      picker.kind === 'add'
        ? draft.exercises.length
        : picker.kind === 'replace'
          ? picker.index
          : picker.index + 1,
    );
    setPicker(null);
    if (step !== 1) setStep(1);
  }
  /** Copies an exercise with all its settings right below it (the same exercise again). */
  function duplicate(index: number) {
    if (draft.exercises.length >= PLAN_LIMITS.exercises) return;
    setDraft((current) => {
      const exercises = [...current.exercises];
      const source = exercises[index];
      if (!source) return current;
      // A copy placed inside a superset (between two linked exercises) joins it.
      const copy = newPlanExercise(source.exerciseId, source);
      if (linkedWithNext(exercises, index)) copy.group = source.group;
      exercises.splice(index + 1, 0, copy);
      return { ...current, exercises: normalizeGroups(exercises) };
    });
    setFlash(index + 1);
  }
  function discardDraft() {
    clearStoredDraft(storageKey.current);
    setDraftState(JSON.parse(original.current) as ProgramDraft);
    setRestored(null);
    setAttempted(new Set());
    setStep(0);
  }
  function applyTemplate(id: string) {
    const template = templates.find((p) => p.id === id);
    if (!template) return;
    const copy = draftFromProgram(template);
    setDraft((current) => ({
      ...current,
      name: current.name.trim() ? current.name : copy.name,
      description: current.description || copy.description,
      exercises: copy.exercises.filter((row) => byId.has(row.exerciseId)),
    }));
  }

  const nameIssue = fieldIssue('name');
  const daysIssue = fieldIssue('days');
  const exercisesIssue = fieldIssue('exercises');
  const assignee = clients.find((r) => r.clientId === draft.assignedClientId)?.client.name;

  return (
    <div className="wb" ref={top}>
      <PageHeading
        title={t(draft.id ? 'wbEditWorkout' : 'newProgram')}
        subtitle={t(isCoach ? 'wbSubtitleCoach' : 'wbSubtitle')}
      >
        <button type="button" className="button secondary" onClick={() => navigate('workouts')}>
          {t('cancel')}
        </button>
      </PageHeading>
      {restored && (
        <div className="wb-restored" role="status">
          <RotateCcw size={16} aria-hidden="true" />
          <span className="grow">{t('wbDraftRestored')}</span>
          <button type="button" className="text-button" onClick={discardDraft}>
            {t('wbDiscardDraft')}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('close')}
            onClick={() => setRestored(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <nav className="wb-steps" aria-label={t('wbSteps')}>
        {STEPS.map((key, index) => {
          const done = index < step && !stepIssues(index).length;
          return (
            <button
              key={key}
              type="button"
              className={`wb-step ${index === step ? 'current' : ''} ${done ? 'done' : ''}`}
              aria-current={index === step ? 'step' : undefined}
              onClick={() => goTo(index)}
            >
              <span className="wb-step-dot" aria-hidden="true">
                {done ? <Check size={13} strokeWidth={3} /> : index + 1}
              </span>
              <span>{t(key)}</span>
            </button>
          );
        })}
      </nav>
      <div className={`wb-layout ${step === 2 ? 'reviewing' : ''}`}>
        <div className="wb-main">
          {step === 0 && (
            <section className="panel wb-panel wb-enter" aria-labelledby="wb-details-title">
              <h2 id="wb-details-title" className="wb-panel-title">
                {t('workoutDetails')}
              </h2>
              <label className="wb-field">
                <span>{t('wbWorkoutName')}</span>
                <input
                  value={draft.name}
                  maxLength={200}
                  placeholder={t('wbNamePlaceholder')}
                  aria-invalid={!!nameIssue}
                  aria-describedby={nameIssue ? 'wb-name-error' : undefined}
                  autoComplete="off"
                  enterKeyHint="next"
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </label>
              {nameIssue && (
                <p className="wb-error" id="wb-name-error" role="alert">
                  {t(nameIssue)}
                </p>
              )}
              {!draft.name && (
                <div className="wb-suggestions" aria-label={t('wbSuggestions')}>
                  {NAME_SUGGESTIONS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      className="wb-chip"
                      onClick={() => setDraft((d) => ({ ...d, name: t(key) }))}
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              )}
              <DayChips
                days={draft.days}
                optional={draft.template}
                issue={daysIssue}
                onToggle={(day) => setDraft((d) => ({ ...d, days: toggleDay(d.days, day) }))}
              />
              <label className="wb-field">
                <span>
                  {t('description')} <small className="muted">{t('wbOptional')}</small>
                </span>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={draft.description}
                  placeholder={t('wbDescriptionPlaceholder')}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </label>
              {isCoach && (
                <label className="wb-field">
                  <span>
                    <Users size={15} aria-hidden="true" /> {t('assignTo')}
                  </span>
                  <select
                    value={draft.assignedClientId || ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, assignedClientId: e.target.value || null }))
                    }
                  >
                    <option value="">{t('unassignedWorkout')}</option>
                    {clients.map((r) => (
                      <option key={r.id} value={r.clientId}>
                        {r.client.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!draft.id && templates.length > 0 && (
                <label className="wb-field">
                  <span>
                    <LayoutTemplate size={15} aria-hidden="true" /> {t('wbStartFromTemplate')}
                  </span>
                  <select value="" onChange={(e) => applyTemplate(e.target.value)}>
                    <option value="">{t('wbChooseTemplate')}</option>
                    {templates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.exercises.length} {t('exercises')}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="wb-toggle">
                <input
                  type="checkbox"
                  role="switch"
                  checked={draft.template}
                  onChange={(e) => setDraft((d) => ({ ...d, template: e.target.checked }))}
                />
                <span className="wb-switch" aria-hidden="true" />
                <span>
                  <strong>{t('saveTemplate')}</strong>
                  <small>{t('wbTemplateHint')}</small>
                </span>
              </label>
            </section>
          )}
          {step === 1 && (
            <section className="wb-exercises wb-enter" aria-labelledby="wb-exercises-title">
              <div className="wb-section-head">
                <h2 id="wb-exercises-title">
                  {t('yourExercises')} <span className="wb-count">{draft.exercises.length}</span>
                </h2>
                {draft.exercises.length > 0 && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setPicker({ kind: 'add' })}
                  >
                    <Plus size={16} /> {t('wbAddExercises')}
                  </button>
                )}
              </div>
              {!draft.exercises.length ? (
                <div className="panel wb-empty">
                  <span className="wb-empty-icon">
                    <Dumbbell size={28} />
                  </span>
                  <h3>{t('startYourWorkout')}</h3>
                  <p>{t('wbEmptyHint')}</p>
                  <button
                    type="button"
                    className="button primary large"
                    onClick={() => setPicker({ kind: 'add' })}
                  >
                    <Plus size={18} /> {t('wbAddExercises')}
                  </button>
                  {exercisesIssue && (
                    <p className="wb-error" role="alert">
                      {t(exercisesIssue)}
                    </p>
                  )}
                </div>
              ) : (
                <ExerciseList
                  exercises={draft.exercises}
                  byId={byId}
                  labels={labels}
                  flash={flash}
                  issueFor={(index) => fieldIssue(String(index))}
                  onPatch={patchExercise}
                  onMove={(from, to) =>
                    setDraft((d) => ({ ...d, exercises: moveExercise(d.exercises, from, to) }))
                  }
                  onRemove={(index) =>
                    setDraft((d) => ({
                      ...d,
                      exercises: normalizeGroups(d.exercises.filter((_, i) => i !== index)),
                    }))
                  }
                  onLink={(index) =>
                    setDraft((d) => ({ ...d, exercises: toggleSuperset(d.exercises, index) }))
                  }
                  onReplace={(index) => setPicker({ kind: 'replace', index })}
                  onDuplicate={duplicate}
                  onTechnique={setTechnique}
                />
              )}
              {draft.exercises.length > 0 && draft.exercises.length < PLAN_LIMITS.exercises && (
                <button
                  type="button"
                  className="wb-add-more"
                  onClick={() => setPicker({ kind: 'add' })}
                >
                  <Plus size={18} /> {t('wbAddExercises')}
                </button>
              )}
            </section>
          )}
          {step === 2 && (
            <section className="panel wb-panel wb-enter" aria-labelledby="wb-review-title">
              <h2 id="wb-review-title" className="wb-panel-title">
                {t('wbReviewTitle')}
              </h2>
              <WorkoutPreview draft={draft} byId={byId} assignee={assignee} />
              {issues.length > 0 && (
                <ul className="wb-issues" role="alert">
                  {[...new Set(issues.map((issue) => issue.issue))].map((issue) => (
                    <li key={issue}>{t(issue)}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
        <aside className="wb-aside" aria-label={t('wbLivePreview')}>
          <div className="panel wb-panel">
            <h2 className="wb-panel-title">{t('wbLivePreview')}</h2>
            <WorkoutPreview draft={draft} byId={byId} assignee={assignee} compact />
          </div>
        </aside>
      </div>
      <div className="wb-actionbar" role="region" aria-label={t('wbActions')}>
        <div className="wb-actionbar-inner">
          <div className="wb-totals" aria-live="polite">
            <span>
              <ListOrdered size={14} aria-hidden="true" /> {draft.exercises.length} {t('exercises')}
            </span>
            <span>
              {sets} {t('wbSetsLower')}
            </span>
            <span>
              <Clock size={14} aria-hidden="true" /> ~{minutes} {t('wbMin')}
            </span>
          </div>
          {saveError && (
            <p className="wb-error wb-save-error" role="alert">
              {t(saveError)}
            </p>
          )}
          <div className="wb-actionbar-buttons">
            {step > 0 && (
              <button type="button" className="button secondary" onClick={() => goTo(step - 1)}>
                {t('wbBack')}
              </button>
            )}
            {step < 2 && !issues.length && (
              <button
                type="button"
                className="button secondary wb-quick-save"
                disabled={saving}
                onClick={save}
              >
                {t('wbSaveNow')}
              </button>
            )}
            {step < 2 ? (
              <button type="button" className="button primary" onClick={advance}>
                {t('wbContinue')}
              </button>
            ) : (
              <button
                type="button"
                className="button primary"
                disabled={saving}
                aria-busy={saving}
                onClick={save}
              >
                <Check size={16} /> {t(draft.id ? 'save' : 'wbSaveWorkout')}
              </button>
            )}
          </div>
        </div>
      </div>
      {picker && (
        <ExercisePicker
          mode={picker}
          library={library.exercises}
          added={added}
          current={picker.kind === 'add' ? undefined : draft.exercises[picker.index]?.exerciseId}
          remaining={PLAN_LIMITS.exercises - draft.exercises.length}
          onPick={pick}
          onPreview={setTechnique}
          onClose={() => setPicker(null)}
        />
      )}
      {technique && (
        <Modal
          className="exercise-demo-modal exercise-technique-modal"
          title={exerciseName(technique, lang)}
          onClose={() => setTechnique(null)}
        >
          <ExerciseTechnique exercise={technique} />
        </Modal>
      )}
    </div>
  );
}

function DayChips({
  days,
  optional,
  issue,
  onToggle,
}: {
  days: string;
  optional: boolean;
  issue?: string;
  onToggle: (day: number) => void;
}) {
  const { t } = useNutri();
  const week = useWeekdays();
  const picked = parseDays(days);
  const today = new Date().getDay();
  return (
    <fieldset className="wb-field wb-days-field">
      <legend>
        <CalendarDays size={15} aria-hidden="true" /> {t('wbAssignedDay')}{' '}
        {optional && <small className="muted">{t('wbOptional')}</small>}
      </legend>
      <div className="wb-days" aria-invalid={!!issue}>
        {week.order.map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={picked.includes(day)}
            aria-label={week.long(day)}
            className={`wb-day ${picked.includes(day) ? 'picked' : ''} ${day === today ? 'today' : ''}`}
            onClick={() => onToggle(day)}
          >
            {week.short(day)}
          </button>
        ))}
      </div>
      <p className={issue ? 'wb-error' : 'wb-hint'} role={issue ? 'alert' : undefined}>
        {issue ? t(issue) : picked.length ? week.list(picked) : t('wbDayHint')}
      </p>
    </fieldset>
  );
}

/** Pointer-based reordering that works with touch, mouse and pen alike. */
function ExerciseList({
  exercises,
  byId,
  labels,
  flash,
  issueFor,
  onPatch,
  onMove,
  onRemove,
  onLink,
  onReplace,
  onDuplicate,
  onTechnique,
}: {
  exercises: PlanExercise[];
  byId: Map<string, LibraryExercise>;
  labels: string[];
  flash: number | null;
  issueFor: (index: number) => string | undefined;
  onPatch: (index: number, values: Partial<PlanExercise>) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onLink: (index: number) => void;
  onReplace: (index: number) => void;
  onDuplicate: (index: number) => void;
  onTechnique: (exercise: LibraryExercise) => void;
}) {
  const { t, lang } = useNutri();
  const list = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; offset: number } | null>(null);
  const gesture = useRef<{
    from: number;
    startY: number;
    scroll: number;
    mids: number[];
    height: number;
  } | null>(null);
  const autoScroll = useRef(0);
  useEffect(() => () => cancelAnimationFrame(autoScroll.current), []);

  function start(index: number, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const items = Array.from(list.current?.children || []) as HTMLElement[];
    const rects = items.map((item) => item.getBoundingClientRect());
    gesture.current = {
      from: index,
      startY: event.clientY,
      scroll: window.scrollY,
      mids: rects.map((rect) => rect.top + window.scrollY + rect.height / 2),
      height: rects[index]?.height || 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ from: index, to: index, offset: 0 });
  }
  function update(clientY: number) {
    const g = gesture.current;
    if (!g) return;
    const offset = clientY - g.startY + (window.scrollY - g.scroll);
    const center = g.mids[g.from] + offset;
    let to = g.from;
    while (to < g.mids.length - 1 && center > g.mids[to + 1]) to++;
    while (to > 0 && center < g.mids[to - 1]) to--;
    setDrag({ from: g.from, to, offset });
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!gesture.current) return;
    const y = event.clientY;
    update(y);
    cancelAnimationFrame(autoScroll.current);
    const edge = y < 90 ? -1 : y > innerHeight - 150 ? 1 : 0;
    if (edge) {
      const step = () => {
        window.scrollBy(0, edge * 10);
        update(y);
        autoScroll.current = requestAnimationFrame(step);
      };
      autoScroll.current = requestAnimationFrame(step);
    }
  }
  function end() {
    cancelAnimationFrame(autoScroll.current);
    const g = gesture.current;
    gesture.current = null;
    if (g && drag && drag.to !== g.from) {
      onMove(g.from, drag.to);
      navigator.vibrate?.(15);
    }
    setDrag(null);
  }

  return (
    <>
      <p id="wb-reorder-hint" hidden>
        {t('wbReorderHint')}
      </p>
      <ol className={`wb-list ${drag ? 'is-dragging' : ''}`} ref={list}>
        {exercises.map((row, index) => {
          const exercise = byId.get(row.exerciseId);
          const label = labels[index];
          const linked = linkedWithNext(exercises, index);
          const shift =
            drag && index !== drag.from
              ? drag.from < index && index <= drag.to
                ? -1
                : drag.to <= index && index < drag.from
                  ? 1
                  : 0
              : 0;
          return (
            <li
              key={`${row.exerciseId}-${index}`}
              className={`wb-item ${label ? 'in-superset' : ''} ${linked ? 'linked-next' : ''} ${
                drag?.from === index ? 'dragging' : ''
              }`}
              style={
                drag?.from === index
                  ? { transform: `translateY(${drag.offset}px)` }
                  : shift
                    ? { transform: `translateY(${shift * (gesture.current?.height || 0)}px)` }
                    : undefined
              }
            >
              <ExerciseCard
                row={row}
                index={index}
                exercise={exercise}
                superset={label}
                issue={issueFor(index)}
                flash={flash === index}
                dragging={drag?.from === index}
                onHandleDown={(event) => start(index, event)}
                onHandleMove={move}
                onHandleUp={end}
                onHandleKey={(direction) => {
                  const to = index + direction;
                  if (to >= 0 && to < exercises.length) onMove(index, to);
                }}
                onPatch={(values) => onPatch(index, values)}
                onRemove={() => onRemove(index)}
                onReplace={() => onReplace(index)}
                onDuplicate={() => onDuplicate(index)}
                onTechnique={() => exercise && onTechnique(exercise)}
                isFirst={index === 0}
                isLast={index === exercises.length - 1}
              />
              {index < exercises.length - 1 && (
                <button
                  type="button"
                  className={`wb-link ${linked ? 'active' : ''}`}
                  aria-pressed={linked}
                  aria-label={`${t(linked ? 'wbUnlinkSuperset' : 'wbLinkSuperset')}: ${
                    exercise ? exerciseName(exercise, lang) : ''
                  } + ${(() => {
                    const next = byId.get(exercises[index + 1].exerciseId);
                    return next ? exerciseName(next, lang) : '';
                  })()}`}
                  onClick={() => onLink(index)}
                >
                  {linked ? <Link2 size={14} /> : <Link2Off size={14} />}
                  <span>{t(linked ? 'wbSuperset' : 'wbLinkSuperset')}</span>
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function ExerciseCard({
  row,
  index,
  exercise,
  superset,
  issue,
  flash,
  dragging,
  isFirst,
  isLast,
  onHandleDown,
  onHandleMove,
  onHandleUp,
  onHandleKey,
  onPatch,
  onRemove,
  onReplace,
  onDuplicate,
  onTechnique,
}: {
  row: PlanExercise;
  index: number;
  exercise?: LibraryExercise;
  superset: string;
  issue?: string;
  flash: boolean;
  dragging: boolean;
  isFirst: boolean;
  isLast: boolean;
  onHandleDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onHandleMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onHandleUp: () => void;
  onHandleKey: (direction: -1 | 1) => void;
  onPatch: (values: Partial<PlanExercise>) => void;
  onRemove: () => void;
  onReplace: () => void;
  onDuplicate: () => void;
  onTechnique: () => void;
}) {
  const { t, lang } = useNutri();
  const [notesOpen, setNotesOpen] = useState(!!row.notes);
  const range = row.repsMax > 0;
  const title = exercise ? exerciseName(exercise, lang) : '';
  return (
    <article
      className={`wb-card ${dragging ? 'dragging' : ''} ${flash ? 'flash' : ''} ${issue ? 'invalid' : ''}`}
      aria-label={`${index + 1}. ${title}`}
    >
      <header className="wb-card-head">
        <button
          type="button"
          className="wb-handle"
          aria-label={`${t('wbReorder')}: ${title}`}
          aria-describedby="wb-reorder-hint"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' && !isFirst) {
              event.preventDefault();
              onHandleKey(-1);
            }
            if (event.key === 'ArrowDown' && !isLast) {
              event.preventDefault();
              onHandleKey(1);
            }
          }}
        >
          <GripVertical size={18} />
        </button>
        <button
          type="button"
          className="wb-thumb"
          aria-label={`${t('instructions')}: ${title}`}
          onClick={onTechnique}
        >
          {exercise?.demonstration?.poster ? (
            <img src={exercise.demonstration.poster} alt="" loading="lazy" />
          ) : (
            <Dumbbell size={20} />
          )}
        </button>
        <div className="wb-card-title">
          <span className="wb-card-index">
            {String(index + 1).padStart(2, '0')}
            {superset && (
              <span className="wb-superset-badge">
                {t('wbSuperset')} {superset}
              </span>
            )}
          </span>
          <strong>{title}</strong>
          {exercise && (
            <small>
              {t(exercise.muscle)} · {t(exercise.equipment)}
            </small>
          )}
        </div>
        <button
          type="button"
          className="icon-btn wb-remove"
          aria-label={`${t('wbRemoveExercise')}: ${title}`}
          onClick={onRemove}
        >
          <Trash2 size={16} />
        </button>
      </header>
      <div className="wb-fields">
        <Stepper
          label={t('sets')}
          value={row.sets}
          limits={PLAN_LIMITS.sets}
          onChange={(sets) => onPatch({ sets })}
        />
        <div className={`wb-reps${range ? ' ranged' : ''}`}>
          <Stepper
            label={range ? t('wbRepsMin') : t('reps')}
            value={row.reps}
            limits={PLAN_LIMITS.reps}
            onChange={(reps) =>
              onPatch({ reps, ...(range && row.repsMax < reps ? { repsMax: reps } : {}) })
            }
          />
          {/* New ranges can no longer be created; plans saved with one can still edit or drop it. */}
          {range && (
            <>
              <Stepper
                label={t('wbRepsMax')}
                value={row.repsMax}
                limits={[Math.max(1, row.reps), PLAN_LIMITS.reps[1]]}
                onChange={(repsMax) => onPatch({ repsMax })}
              />
              <button
                type="button"
                className="wb-range-toggle"
                onClick={() => onPatch({ repsMax: 0 })}
              >
                {t('wbSingleTarget')}
              </button>
            </>
          )}
        </div>
        <label className="wb-input">
          <span>
            {t('weight')} ({t('kg')})
          </span>
          <DecimalInput
            value={row.weight}
            max={PLAN_LIMITS.weight[1]}
            placeholder={t('wbOptionalShort')}
            onChange={(weight) => onPatch({ weight })}
          />
        </label>
        <Stepper
          label={`${t('wbRest')} (${t('secondsShort')})`}
          value={row.rest}
          limits={PLAN_LIMITS.rest}
          step={15}
          hint={row.rest >= 60 ? restLabel(row.rest) : undefined}
          onChange={(rest) => onPatch({ rest })}
        />
      </div>
      {notesOpen ? (
        <label className="wb-input wb-notes">
          <span>{t('wbExerciseNotes')}</span>
          <textarea
            rows={2}
            maxLength={PLAN_LIMITS.notes}
            value={row.notes}
            placeholder={t('wbNotesPlaceholder')}
            // Only open on user request, so focus right away.
            autoFocus={!row.notes}
            onChange={(event) => onPatch({ notes: event.target.value })}
          />
        </label>
      ) : null}
      {issue && (
        <p className="wb-error" role="alert">
          {t(issue)}
        </p>
      )}
      <footer className="wb-card-actions">
        {!notesOpen && (
          <button type="button" className="wb-action" onClick={() => setNotesOpen(true)}>
            <StickyNote size={15} /> <span>{t('wbAddNote')}</span>
          </button>
        )}
        <button type="button" className="wb-action" onClick={onReplace}>
          <Replace size={15} /> <span>{t('wbReplace')}</span>
        </button>
        <button type="button" className="wb-action" onClick={onDuplicate}>
          <CopyPlus size={15} /> <span>{t('duplicate')}</span>
        </button>
      </footer>
    </article>
  );
}

/**
 * A weight field that accepts decimals typed either way ("62.5" or "62,5") and keeps the text
 * as typed, so an intermediate "62." is not reformatted away mid-entry.
 */
function DecimalInput({
  value,
  max,
  placeholder,
  onChange,
}: {
  value: number;
  max: number;
  placeholder?: string;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => {
    setText((current) => (parseWeight(current) === value ? current : value ? String(value) : ''));
  }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      dir="ltr"
      value={text}
      placeholder={placeholder}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const next = event.target.value;
        if (!/^\d*[.,]?\d*$/.test(next.trim())) return;
        setText(next);
        onChange(clamp(parseWeight(next), [0, max]));
      }}
    />
  );
}
function parseWeight(text: string) {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() && Number.isFinite(value) ? value : 0;
}

function Stepper({
  label,
  value,
  limits,
  step = 1,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  limits: readonly [number, number];
  step?: number;
  hint?: string;
  onChange: (value: number) => void;
}) {
  const { t } = useNutri();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const set = (next: number) => onChange(clamp(Math.round(next), limits));
  return (
    <div className="wb-stepper" role="group" aria-label={label}>
      <span className="wb-stepper-label">{label}</span>
      <div className="wb-stepper-control">
        <button
          type="button"
          aria-label={`${t('wbDecrease')} ${label}`}
          disabled={value <= limits[0]}
          onClick={() => set(value - step)}
        >
          <Minus size={16} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          aria-label={label}
          min={limits[0]}
          max={limits[1]}
          step={step}
          value={text}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setText(event.target.value);
            const typed = Number(event.target.value);
            // Apply in-range values as they are typed; anything else settles on blur.
            if (event.target.value !== '' && typed >= limits[0] && typed <= limits[1])
              onChange(Math.round(typed));
          }}
          onBlur={() => {
            const next = clamp(Math.round(Number(text || limits[0])), limits);
            setText(String(next));
            if (next !== value) onChange(next);
          }}
        />
        <button
          type="button"
          aria-label={`${t('wbIncrease')} ${label}`}
          disabled={value >= limits[1]}
          onClick={() => set(value + step)}
        >
          <Plus size={16} />
        </button>
      </div>
      {hint && (
        <small className="wb-stepper-hint" dir="ltr">
          {hint}
        </small>
      )}
    </div>
  );
}

export function WorkoutPreview({
  draft,
  byId,
  assignee,
  compact = false,
}: {
  draft: ProgramDraft;
  byId: Map<string, LibraryExercise>;
  assignee?: string;
  compact?: boolean;
}) {
  const { t, lang } = useNutri();
  const week = useWeekdays();
  const days = parseDays(draft.days);
  const labels = supersetLabels(draft.exercises);
  const muscles = targetMuscles(draft.exercises, (id) => byId.get(id)?.muscle);
  return (
    <div className={`wb-preview ${compact ? 'compact' : ''}`}>
      <div className="wb-preview-head">
        <h3>{draft.name.trim() || t('wbUntitled')}</h3>
        <p>
          <CalendarDays size={14} aria-hidden="true" />{' '}
          {days.length ? week.list(days) : t('unscheduled')}
        </p>
        <div className="wb-preview-tags">
          {draft.template && (
            <span className="badge">
              <LayoutTemplate size={12} /> {t('templates')}
            </span>
          )}
          {assignee && (
            <span className="badge">
              <Users size={12} /> {assignee}
            </span>
          )}
        </div>
        {!compact && draft.description && <p className="wb-preview-desc">{draft.description}</p>}
      </div>
      <dl className="wb-stats">
        <div>
          <dt>{t('wbExercisesTitle')}</dt>
          <dd>{draft.exercises.length}</dd>
        </div>
        <div>
          <dt>{t('sets')}</dt>
          <dd>{totalSets(draft.exercises)}</dd>
        </div>
        <div>
          <dt>{t('wbDuration')}</dt>
          <dd>
            ~{estimateMinutes(draft.exercises)} <small>{t('wbMin')}</small>
          </dd>
        </div>
      </dl>
      {muscles.length > 0 && (
        <div className="wb-muscles" aria-label={t('wbTargetMuscles')}>
          <small>{t('wbTargetMuscles')}</small>
          <div>
            {muscles.map((muscle) => (
              <span key={muscle} className="wb-chip static">
                {t(muscle)}
              </span>
            ))}
          </div>
        </div>
      )}
      {draft.exercises.length > 0 ? (
        <ol className="wb-order">
          {draft.exercises.map((row, index) => {
            const exercise = byId.get(row.exerciseId);
            return (
              <li key={`${row.exerciseId}-${index}`} className={labels[index] ? 'in-superset' : ''}>
                <span className="wb-order-index">
                  {labels[index]
                    ? `${labels[index]}${labels.slice(0, index + 1).filter((l) => l === labels[index]).length}`
                    : index + 1}
                </span>
                <span className="grow">
                  <strong>{exercise ? exerciseName(exercise, lang) : ''}</strong>
                  <small dir="auto">
                    {row.sets} × {repsLabel(row)} {t('reps').toLowerCase()}
                    {row.weight ? ` · ${row.weight} ${t('kg')}` : ''}
                    {` · ${restLabel(row.rest)} ${row.rest < 60 ? t('secondsShort') : t('wbMin')} ${t('wbRestLower')}`}
                  </small>
                  {!compact && row.notes && <em>{row.notes}</em>}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted wb-preview-empty">{t('wbPreviewEmpty')}</p>
      )}
    </div>
  );
}

function ExercisePicker({
  mode,
  library,
  added,
  current,
  remaining,
  onPick,
  onPreview,
  onClose,
}: {
  mode: PickerMode;
  library: LibraryExercise[];
  added: Set<string>;
  current?: string;
  remaining: number;
  onPick: (ids: string[]) => void;
  onPreview: (exercise: LibraryExercise) => void;
  onClose: () => void;
}) {
  const { t, lang } = useNutri();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('all');
  const [equipment, setEquipment] = useState('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<string[]>([]);
  const search = useRef<HTMLInputElement>(null);
  const multi = mode.kind === 'add';
  useEffect(() => {
    // Keyboards would cover half the list on phones; focus search on desktop only.
    if (matchMedia('(pointer: fine)').matches) search.current?.focus();
  }, []);
  const available = useMemo(() => library.filter((e) => e.hasDemonstration !== false), [library]);
  const muscles = useMemo(
    () => exerciseGroups.filter((group) => available.some((e) => e.muscle === group)),
    [available],
  );
  const equipmentOptions = useMemo(
    () => [...new Set(available.map((e) => e.equipment))].sort((a, b) => t(a).localeCompare(t(b))),
    [available, t],
  );
  const results = useMemo(() => {
    const words = query
      .toLowerCase()
      .replace(/preacher (chair|bench)/g, 'preacher')
      .split(/\s+/)
      .filter(Boolean);
    return available.filter(
      (e) =>
        (muscle === 'all' || e.muscle === muscle) &&
        (equipment === 'all' || e.equipment === equipment) &&
        words.every((word) => `${e.nameEn} ${e.nameHe}`.toLowerCase().includes(word)),
    );
  }, [available, query, muscle, equipment]);
  const title = t(
    mode.kind === 'add'
      ? 'wbAddExercises'
      : mode.kind === 'replace'
        ? 'wbReplaceTitle'
        : 'wbDuplicateTitle',
  );
  function choose(id: string) {
    if (!multi) return onPick([id]);
    setSelected((list) =>
      list.includes(id)
        ? list.filter((item) => item !== id)
        : list.length < remaining
          ? [...list, id]
          : list,
    );
  }
  return (
    <Modal className="wb-picker" title={title} onClose={onClose}>
      {mode.kind === 'duplicate' && <p className="wb-hint">{t('wbDuplicateHint')}</p>}
      <div className="wb-picker-filters">
        <div className="search-field wb-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={search}
            type="search"
            value={query}
            enterKeyHint="search"
            placeholder={t('searchExercises')}
            aria-label={t('searchExercises')}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE_SIZE);
            }}
          />
          {query && (
            <button
              type="button"
              className="icon-btn"
              aria-label={t('clearSearch')}
              onClick={() => {
                setQuery('');
                search.current?.focus();
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
        <div className="wb-muscle-chips" role="group" aria-label={t('primaryMuscles')}>
          {['all', ...muscles].map((key) => (
            <button
              key={key}
              type="button"
              className={`wb-chip ${muscle === key ? 'active' : ''}`}
              aria-pressed={muscle === key}
              onClick={() => {
                setMuscle(key);
                setLimit(PAGE_SIZE);
              }}
            >
              {t(key)}
            </button>
          ))}
        </div>
        <div className="wb-picker-row">
          <select
            value={equipment}
            aria-label={t('wbEquipment')}
            onChange={(e) => {
              setEquipment(e.target.value);
              setLimit(PAGE_SIZE);
            }}
          >
            <option value="all">{t('allEquipment')}</option>
            {equipmentOptions.map((key) => (
              <option key={key} value={key}>
                {t(key)}
              </option>
            ))}
          </select>
          <span className="wb-result-count" role="status">
            {results.length.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')} {t('catalogResults')}
          </span>
        </div>
      </div>
      <ul className="wb-results">
        {results.slice(0, limit).map((e) => {
          const isAdded = added.has(e.id) && e.id !== current;
          const isCurrent = e.id === current && mode.kind === 'replace';
          const isSelected = selected.includes(e.id);
          const name = exerciseName(e, lang);
          return (
            <li key={e.id} className={`wb-result ${isSelected ? 'selected' : ''}`}>
              <button
                type="button"
                className="wb-thumb"
                aria-label={`${t('instructions')}: ${name}`}
                onClick={() => onPreview(e)}
              >
                {e.demonstration?.poster ? (
                  <img src={e.demonstration.poster} alt="" loading="lazy" />
                ) : (
                  <Dumbbell size={18} />
                )}
                <Info size={12} className="wb-thumb-info" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="wb-result-pick"
                disabled={isCurrent}
                aria-pressed={multi ? isSelected : undefined}
                onClick={() => choose(e.id)}
              >
                <span className="grow">
                  <strong>{name}</strong>
                  <small>
                    {t(e.muscle)} · {t(e.equipment)}
                    {isAdded && (
                      <>
                        {' · '}
                        <span className="wb-added-note">{t('wbInWorkout')}</span>
                      </>
                    )}
                  </small>
                </span>
                {isCurrent ? (
                  <span className="wb-added">
                    <Check size={14} /> {t('wbCurrent')}
                  </span>
                ) : (
                  <span className={`wb-pick-icon ${isSelected ? 'on' : ''}`} aria-hidden="true">
                    {isSelected ? <Check size={16} strokeWidth={3} /> : <Plus size={16} />}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!results.length && <p className="wb-hint center">{t('noResults')}</p>}
      {results.length > limit && (
        <button
          type="button"
          className="button secondary wb-more"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
        >
          {t('showMoreExercises')}
        </button>
      )}
      {multi && (
        <div className="wb-picker-footer">
          {selected.length >= remaining && <small className="muted">{t('tooManyExercises')}</small>}
          <button
            type="button"
            className="button primary"
            disabled={!selected.length}
            onClick={() => onPick(selected)}
          >
            <Plus size={16} />
            {selected.length
              ? `${t('wbAddSelected')} (${selected.length})`
              : t('wbSelectExercises')}
          </button>
        </div>
      )}
    </Modal>
  );
}
