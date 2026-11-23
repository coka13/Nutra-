'use client';
import { useEffect, useState } from 'react';
import type { Exercise } from '@prisma/client';
import type { CatalogPage } from '@/lib/exercise-catalog';
import { exerciseGroups } from '@/lib/exercise-groups';
import { Modal, useNutri } from './workspace';
import { cachedCatalogPage, loadCatalogPage, warmCatalogImages } from '@/lib/catalog-client';
import { ExerciseTechnique, PersonalRecords } from './exercise-details';

export function ExerciseCatalog({ cardio = false }: { cardio?: boolean }) {
  const { t, lang, navigate } = useNutri();
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(cardio ? 'cardio' : '');
  const [muscle, setMuscle] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<CatalogPage | null>(
    () => cachedCatalogPage({ category: cardio ? 'cardio' : '' }) || null,
  );
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(false);
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setAnimate(!preference.matches && !document.hidden);
    update();
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      preference.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(name);
      setOffset(0);
    }, 150);
    return () => clearTimeout(timer);
  }, [name]);
  useEffect(() => {
    let active = true;
    setError('');
    const filters = {
      name: search,
      category,
      muscle,
      offset,
    };
    const cached = cachedCatalogPage(filters);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadCatalogPage(filters)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, category, muscle, offset, retry]);
  useEffect(() => {
    if (!data) return;
    if (data !== cachedCatalogPage({ name: search, category, muscle, offset })) return;
    warmCatalogImages(data);
    if (data.offset + data.limit < data.total) {
      loadCatalogPage({ name: search, category, muscle, offset: data.offset + data.limit })
        .then(warmCatalogImages)
        .catch(() => {});
    }
  }, [data, search, category, muscle, offset]);
  return (
    <section className="catalog-section" aria-busy={loading}>
      <p className="muted">{t('catalogDescription')}</p>
      <div className="toolbar wrap">
        <input
          className="catalog-search"
          value={name}
          placeholder={t('searchCatalog')}
          aria-label={t('searchCatalog')}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <select
          aria-label={t('primaryMuscles')}
          value={muscle}
          onChange={(event) => {
            setMuscle(event.target.value);
            setOffset(0);
          }}
        >
          <option value="">{t('allMuscles')}</option>
          {exerciseGroups
            .filter((group) => !['back', 'arms', 'legs', 'core'].includes(group))
            .map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
        </select>
        <select
          aria-label={t('exerciseCategory')}
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setOffset(0);
          }}
        >
          {['', 'cardio', 'strength', 'stretching', 'plyometric'].map((value) => (
            <option key={value} value={value}>
              {value ? t('category_' + value) : t('allCategories')}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <div className="panel" role="status">
          <p>{t(error)}</p>
          <button
            className="button secondary"
            onClick={() => {
              setRetry(retry + 1);
            }}
          >
            {t('retry')}
          </button>
        </div>
      ) : !data ? (
        <p role="status">{t('loading')}</p>
      ) : (
        <>
          <p aria-live="polite">
            {data.total.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')} {t('catalogResults')}
          </p>
          {!data.results.length && <p>{t('noResults')}</p>}
          {exerciseGroups
            .filter((group) => data.results.some((exercise) => exercise.muscle === group))
            .map((group) => (
              <section className="catalog-muscle-group" key={group} aria-label={t(group)}>
                <h2>{t(group)}</h2>
                <div className="exercise-grid">
                  {data.results
                    .filter((exercise) => exercise.muscle === group)
                    .map((exercise) => (
                      <button
                        className="panel exercise-card catalog-card"
                        key={exercise.id}
                        onClick={() => setSelected(exercise)}
                      >
                        {exercise.thumbnail && (
                          <img
                            className="catalog-thumbnail"
                            src={
                              animate && exercise.animation
                                ? exercise.animation
                                : exercise.thumbnail
                            }
                            alt=""
                            loading="eager"
                            decoding="async"
                            width={178}
                            height={100}
                          />
                        )}
                        <div>
                          <span className="badge neutral">{t(exercise.muscle)}</span>
                          <h3>{lang === 'he' ? exercise.nameHe : exercise.nameEn}</h3>
                          {exercise.hasVideo && <span className="badge">{t('hdVideo')}</span>}
                          <p>{t(exercise.equipment)}</p>
                          <span className="text-button">{t('exerciseDemo')} ↗</span>
                        </div>
                      </button>
                    ))}
                </div>
              </section>
            ))}
          <div className="row wrap catalog-pagination">
            <button
              className="button secondary"
              disabled={loading || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - data.limit))}
            >
              {t('previousPage')}
            </button>
            <span>
              {Math.min(offset + 1, data.total)}–
              {Math.min(offset + data.results.length, data.total)} / {data.total}
            </span>
            <button
              className="button secondary"
              disabled={loading || offset + data.limit >= data.total}
              onClick={() => setOffset(offset + data.limit)}
            >
              {t('nextPage')}
            </button>
          </div>
        </>
      )}
      {selected && (
        <Modal
          className="exercise-demo-modal"
          title={lang === 'he' ? selected.nameHe : selected.nameEn}
          onClose={() => setSelected(null)}
        >
          <div className="exercise-demo-modal-body">
            {lang === 'he' && (
              <p className="muted" dir="ltr" lang="en">
                {selected.nameEn}
              </p>
            )}
            <ExerciseTechnique exercise={selected} />
          </div>
          <div className="exercise-demo-modal-footer">
            <button
              className="button primary"
              onClick={() => navigate('builder?exercise=' + selected.id)}
            >
              {t('addToWorkout')}
            </button>
            <PersonalRecords exerciseId={selected.id} />
          </div>
        </Modal>
      )}
    </section>
  );
}
