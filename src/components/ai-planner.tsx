'use client';

import { useState } from 'react';
import { Dumbbell, Loader2, Sparkles, Trash2, Utensils, Wand2 } from 'lucide-react';
import type { MenuDraft, WorkoutDraft } from '@/lib/ai';
import { api, useNutri } from './workspace';

type Kind = 'workout' | 'menu';
type Result = { kind: 'workout'; draft: WorkoutDraft } | { kind: 'menu'; draft: MenuDraft };

const meals = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

/** Generates a workout or menu draft from the app's own catalog; nothing is saved until "Save". */
export function AiPlanner({ enabled }: { enabled: boolean }) {
  const { state, t, run, navigate, lang, number } = useNutri();
  const isCoach = state.user.role === 'COACH';
  const clients = state.relationships.filter(
    (link) => link.coachId === state.user.id && link.status === 'ACTIVE',
  );
  const [kind, setKind] = useState<Kind>('workout');
  const [clientId, setClientId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [name, setName] = useState('');

  async function generate() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const next = await api<Result>('ai/plan', { kind, prompt, clientId: clientId || null });
      setResult(next);
      setName(next.draft.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'offline');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    setError('');
    try {
      if (result.kind === 'workout') {
        await run('programs/save', {
          name: name.trim() || result.draft.name,
          description: result.draft.description,
          weeks: 0,
          days: result.draft.days.join(','),
          template: false,
          assignedClientId: clientId || null,
          exercises: result.draft.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            sets: e.sets,
            reps: e.reps,
            rest: e.rest,
            weight: 0,
            group: '',
          })),
        });
        navigate('workouts');
      } else {
        await run('meal-plans', {
          name: name.trim() || result.draft.name,
          content: result.draft.notes,
          items: result.draft.items.map((i) => ({
            foodId: i.foodId,
            grams: i.grams,
            meal: i.meal,
          })),
          assignedClientId: clientId || null,
        });
        navigate('mealPlans');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'serverError');
    } finally {
      setSaving(false);
    }
  }

  function removeAt(index: number) {
    setResult((current) => {
      if (!current) return current;
      if (current.kind === 'workout')
        return {
          ...current,
          draft: {
            ...current.draft,
            exercises: current.draft.exercises.filter((_, i) => i !== index),
          },
        };
      return {
        ...current,
        draft: { ...current.draft, items: current.draft.items.filter((_, i) => i !== index) },
      };
    });
  }

  const weekday = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en', { weekday: 'short' });
  // 2023-01-01 was a Sunday, so day n is n days later.
  const dayName = (day: number) => weekday.format(new Date(Date.UTC(2023, 0, 1 + day, 12)));
  const empty =
    !result ||
    (result.kind === 'workout' ? !result.draft.exercises.length : !result.draft.items.length);

  return (
    <section className="panel ai-planner" aria-label={t('aiCreate')}>
      <div className="section-heading">
        <h2>
          <Wand2 size={20} aria-hidden="true" />
          {t('aiCreate')}
        </h2>
      </div>
      <p className="muted small-copy">{t('aiCreateHint')}</p>
      <div className="segmented compact-segmented ai-planner-kind" role="radiogroup">
        {(
          [
            ['workout', Dumbbell, 'aiCreateWorkout'],
            ['menu', Utensils, 'aiCreateMenu'],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={kind === key}
            className={kind === key ? 'active' : ''}
            onClick={() => {
              setKind(key);
              setResult(null);
            }}
          >
            <Icon size={15} />
            {t(label)}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
        {isCoach && (
          <label>
            {t('aiCreateFor')}
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">{t('aiCreateGeneral')}</option>
              {clients.map((link) => (
                <option key={link.clientId} value={link.clientId}>
                  {link.client.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t(kind === 'workout' ? 'aiWorkoutRequest' : 'aiMenuRequest')}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={2000}
            required
            rows={3}
            placeholder={t(kind === 'workout' ? 'aiWorkoutPlaceholder' : 'aiMenuPlaceholder')}
            disabled={!enabled || busy}
          />
        </label>
        <button className="button primary" disabled={!enabled || busy}>
          {busy ? <Loader2 size={17} className="spin" /> : <Sparkles size={17} />}
          {t(busy ? 'aiGenerating' : 'aiGenerate')}
        </button>
      </form>

      {result && (
        <article className="ai-draft">
          <span className="eyebrow">{t('aiDraft')}</span>
          <label>
            {t('name')}
            <input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </label>

          {result.kind === 'workout' ? (
            <>
              {result.draft.description && <p>{result.draft.description}</p>}
              <div className="ai-draft-days">
                {result.draft.days.map((day) => (
                  <span className="badge neutral" key={day}>
                    {dayName(day)}
                  </span>
                ))}
              </div>
              <ol className="ai-draft-list">
                {result.draft.exercises.map((exercise, i) => (
                  <li key={exercise.exerciseId}>
                    <span className="grow">
                      <strong>{lang === 'he' ? exercise.nameHe : exercise.nameEn}</strong>
                      <small>
                        {exercise.sets} × {exercise.reps} · {t('rest')} {exercise.rest}s
                      </small>
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('remove')}
                      onClick={() => removeAt(i)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              {result.draft.notes && <p className="ai-draft-notes">{result.draft.notes}</p>}
              <div className="ai-draft-totals">
                <strong>
                  {number(result.draft.items.reduce((sum, i) => sum + i.calories, 0))} {t('kcal')}
                </strong>
                <span>
                  {t('protein')}{' '}
                  {number(Math.round(result.draft.items.reduce((sum, i) => sum + i.protein, 0)))}{' '}
                  {t('grams')}
                </span>
              </div>
              {meals.map((meal) => {
                const rows = result.draft.items
                  .map((item, index) => ({ item, index }))
                  .filter(({ item }) => item.meal === meal);
                if (!rows.length) return null;
                return (
                  <div key={meal}>
                    <h3>{t(meal)}</h3>
                    <ul className="ai-draft-list">
                      {rows.map(({ item, index }) => (
                        <li key={`${item.foodId}-${index}`}>
                          <span className="grow">
                            <strong>{lang === 'he' ? item.nameHe : item.nameEn}</strong>
                            <small>
                              {number(item.grams)} {t('grams')} · {number(item.calories)}{' '}
                              {t('kcal')}
                            </small>
                          </span>
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={t('remove')}
                            onClick={() => removeAt(index)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {result.draft.unmatched.length > 0 && (
                <p className="muted small-copy">
                  {t('aiUnmatched')}: {result.draft.unmatched.join(', ')}
                </p>
              )}
            </>
          )}

          <p className="muted small-copy">{t('aiReviewHint')}</p>
          <div className="row wrap">
            <button
              type="button"
              className="button primary"
              disabled={saving || empty}
              onClick={() => void save()}
            >
              {saving && <Loader2 size={16} className="spin" />}
              {t(clientId ? 'aiSaveAndAssign' : 'aiSave')}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void generate()}
            >
              {t('aiRegenerate')}
            </button>
          </div>
        </article>
      )}
      {error && (
        <p role="alert" className="form-error">
          {t(error)}
        </p>
      )}
    </section>
  );
}
