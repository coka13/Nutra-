'use client';

import { useEffect, useState } from 'react';
import { Camera, Loader2, Sparkles, Trash2 } from 'lucide-react';
import type { PhotoDraft, PhotoFoodDraft } from '@/lib/ai';
import { encodePhoto } from './progress-photos';
import { api, Modal, useNutri } from './workspace';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

/** Snap a plate, let the AI identify the foods, review the portions, then log them. */
export function MealPhotoModal({
  initialMeal,
  onClose,
}: {
  initialMeal: string;
  onClose: () => void;
}) {
  const { state, t, lang, date, run, number } = useNutri();
  const [meal, setMeal] = useState(initialMeal);
  const [image, setImage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<PhotoFoodDraft[] | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<'encode' | 'analyze' | 'save' | null>(null);
  const [error, setError] = useState('');
  const enabled = state.integrations.photo && !!state.profile?.adult && !!state.profile.aiConsent;

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError('');
    setItems(null);
    setBusy('encode');
    try {
      setImage(await encodePhoto(file));
      setPreview(URL.createObjectURL(file));
    } catch {
      setImage(null);
      setPreview(null);
      setError('photoError');
    } finally {
      setBusy(null);
    }
  }

  async function analyze() {
    if (!image) return;
    setBusy('analyze');
    setError('');
    try {
      const { draft } = await api<{ draft: PhotoDraft }>('ai/photo', { image, note });
      setItems(draft.items);
      setNotes(draft.notes);
      if (!draft.items.length) setError('noFoodInPhoto');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'serverError');
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!items?.length) return;
    setBusy('save');
    setError('');
    try {
      await run('meals/photo', { meal, date, items });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'serverError');
      setBusy(null);
    }
  }

  const update = (index: number, grams: number) =>
    setItems((all) => all && all.map((item, i) => (i === index ? { ...item, grams } : item)));
  const remove = (index: number) => setItems((all) => all && all.filter((_, i) => i !== index));
  const scaled = (item: PhotoFoodDraft, key: keyof PhotoFoodDraft['per100']) =>
    (item.per100[key] * item.grams) / 100;
  const total = (key: keyof PhotoFoodDraft['per100']) =>
    (items ?? []).reduce((sum, item) => sum + scaled(item, key), 0);
  const validGrams = (items ?? []).every((item) => item.grams > 0 && item.grams <= 2000);

  return (
    <Modal title={t('scanMeal')} onClose={onClose} dismissOnBackdrop={!busy}>
      <p className="muted small-copy">{t('scanMealHint')}</p>
      {!enabled ? (
        <p role="alert" className="form-error">
          {t(state.integrations.photo ? 'consent' : 'photoDisabled')}
        </p>
      ) : (
        <div className="meal-photo">
          <label className="meal-photo-pick">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
              <img src={preview} alt={t('mealPhoto')} />
            ) : (
              <span>
                <Camera size={28} />
                {t('mealPhoto')}
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              disabled={!!busy}
              onChange={(e) => {
                void choose(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <div className="form-grid">
            <label>
              {t('meal')}
              <select value={meal} onChange={(e) => setMeal(e.target.value)} disabled={!!busy}>
                {MEALS.map((k) => (
                  <option value={k} key={k}>
                    {t(k)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('photoNote')}
              <input
                value={note}
                maxLength={300}
                placeholder={t('photoNotePlaceholder')}
                onChange={(e) => setNote(e.target.value)}
                disabled={!!busy}
              />
            </label>
          </div>
          {items === null || !items.length ? (
            <button
              type="button"
              className="button primary full"
              disabled={!image || !!busy}
              onClick={() => void analyze()}
            >
              {busy ? <Loader2 size={17} className="spin" /> : <Sparkles size={17} />}
              {t(busy === 'analyze' ? 'analyzingPhoto' : 'analyzePhoto')}
            </button>
          ) : (
            <article className="ai-draft">
              <span className="eyebrow">{t('aiDraft')}</span>
              {notes && <p className="ai-draft-notes">{notes}</p>}
              <div className="ai-draft-totals">
                <strong>
                  {number(Math.round(total('calories')))} {t('kcal')}
                </strong>
                {(['protein', 'carbs', 'fat'] as const).map((k) => (
                  <span key={k}>
                    {t(k)} {number(Math.round(total(k)))} {t('grams')}
                  </span>
                ))}
              </div>
              <ul className="ai-draft-list">
                {items.map((item, index) => (
                  <li key={`${item.foodId ?? item.nameEn}-${index}`}>
                    <span className="grow">
                      <strong>{lang === 'he' ? item.nameHe : item.nameEn}</strong>
                      <small>
                        {number(Math.round(scaled(item, 'calories')))} {t('kcal')} ·{' '}
                        {t(item.foodId ? 'fromDatabase' : 'aiEstimate')}
                      </small>
                    </span>
                    <label className="meal-photo-grams">
                      <input
                        type="number"
                        min={1}
                        max={2000}
                        step={1}
                        value={item.grams || ''}
                        aria-label={`${t('grams')} · ${lang === 'he' ? item.nameHe : item.nameEn}`}
                        onChange={(e) => update(index, Number(e.target.value))}
                        disabled={!!busy}
                      />
                      <small>{t('grams')}</small>
                    </label>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('remove')}
                      onClick={() => remove(index)}
                      disabled={!!busy}
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="muted small-copy">{t('photoReviewHint')}</p>
              <div className="row wrap">
                <button
                  type="button"
                  className="button primary"
                  disabled={!!busy || !validGrams}
                  onClick={() => void save()}
                >
                  {busy === 'save' && <Loader2 size={16} className="spin" />}
                  {t('logMeal')}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!!busy}
                  onClick={() => void analyze()}
                >
                  {busy === 'analyze' && <Loader2 size={16} className="spin" />}
                  {t('aiRegenerate')}
                </button>
              </div>
            </article>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {t(error)}
        </p>
      )}
    </Modal>
  );
}
