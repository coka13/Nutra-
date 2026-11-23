'use client';

import { useEffect, useState } from 'react';
import type { Exercise } from '@prisma/client';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, Empty, Modal, useNutri } from './workspace';
import type { ExerciseDemonstration } from '@/lib/exercise-demonstrations';

const demonstrations: Record<string, [string, string, string]> = {
  squat: ['glutes,quadriceps', 'abdominals,hamstrings', 'heelLift'],
  pushup: ['pectorals', 'triceps,frontDelts', 'hipsSag'],
  row: ['lats', 'biceps,rearDelts', 'torsoTwist'],
  rdl: ['hamstrings,glutes', 'spinalErectors', 'roundBack'],
  press: ['frontDelts', 'triceps,sideDelts', 'backArch'],
  bridge: ['glutes', 'hamstrings,abdominals', 'backArch'],
  deadbug: ['abdominals', 'hipFlexors', 'backArch'],
  lunge: ['quadriceps,glutes', 'hamstrings,calves', 'heelLift'],
  pulldown: ['lats', 'biceps,upperBack', 'swing'],
  chestpress: ['pectorals', 'triceps,frontDelts', 'swing'],
  calf: ['calves', '', 'bounce'],
  walk: ['calves,quadriceps', 'hamstrings,glutes', 'overstride'],
  curl: ['biceps', 'forearms', 'swing'],
  plank: ['abdominals', 'glutes,frontDelts', 'hipsSag'],
  goblet: ['quadriceps,glutes', 'abdominals,upperBack', 'heelLift'],
  legpress: ['quadriceps,glutes', 'hamstrings', 'roundBack'],
  extension: ['quadriceps', '', 'bounce'],
  hamcurl: ['hamstrings', 'calves', 'backArch'],
  laterals: ['sideDelts', 'upperBack', 'swing'],
  facepull: ['rearDelts,upperBack', 'biceps', 'backArch'],
  stepup: ['quadriceps,glutes', 'hamstrings,calves', 'bounce'],
  cable: ['lats,upperBack', 'biceps,rearDelts', 'roundBack'],
  triceps: ['triceps', 'forearms', 'swing'],
};

export function ExerciseTechnique({ exercise }: { exercise: Exercise }) {
  const { t, lang } = useNutri();
  const demo = demonstrations[exercise.id];
  const description = lang === 'he' ? exercise.instructionsHe : exercise.instructionsEn;
  const muscles = (keys: string) => keys.split(',').filter(Boolean).map(t).join(' · ');
  return (
    <div className="exercise-technique">
      <ExerciseDemo key={exercise.id} exercise={exercise} />
      <div className="exercise-technique-copy">
        {demo && (
          <>
            <p>
              <strong>{t('primaryMuscles')}</strong> · {muscles(demo[0])}
            </p>
            {demo[1] && (
              <p>
                <strong>{t('secondaryMuscles')}</strong> · {muscles(demo[1])}
              </p>
            )}
            <p>
              <strong>{t('commonMistake')}</strong> · {t(demo[2])}
            </p>
          </>
        )}
        <h3>{t('instructions')}</h3>
        <ol className="instruction-copy">
          {description.split(/(?<=[.!?])\s+/u).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ExerciseDemo({ exercise }: { exercise: Exercise }) {
  const { t, library } = useNutri();
  const knownMedia = library.exercises.find((row) => row.id === exercise.id)?.demonstration;
  const [details, setDetails] = useState<ExerciseDemonstration | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    if (knownMedia) {
      setDetails({ provider: 'smartworkout', media: knownMedia });
      setLoading(false);
      setFailed(false);
      return;
    }
    setLoading(true);
    setDetails(null);
    setFailed(false);
    api<ExerciseDemonstration>('exercises/' + encodeURIComponent(exercise.id) + '/demonstration')
      .then((result) => {
        if (active) setDetails(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [exercise.id, attempt, knownMedia]);
  return (
    <section className="exercise-demo" aria-label={t('exerciseDemo')}>
      {loading ? (
        <p role="status">{t('loadingDemo')}</p>
      ) : details?.media && !failed ? (
        <ExerciseAnimation
          exerciseId={exercise.id}
          media={details.media}
          onError={() => setFailed(true)}
        />
      ) : (
        <p className="muted" role="status">
          {t('photosUnavailable')}
        </p>
      )}
      {failed && (
        <button className="button secondary" type="button" onClick={() => setAttempt(attempt + 1)}>
          {t('retry')}
        </button>
      )}
    </section>
  );
}

function ExerciseAnimation({
  exerciseId,
  media,
  onError,
}: {
  exerciseId: string;
  media: NonNullable<ExerciseDemonstration['media']>;
  onError: () => void;
}) {
  const { t } = useNutri();
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const animation = 'api/exercises/' + encodeURIComponent(exerciseId) + '/animation?theme=light';
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setPlaying(!preference.matches);
    const visibility = () => setVisible(!document.hidden);
    motion();
    visibility();
    preference.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      preference.removeEventListener('change', motion);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  return (
    <div className="exercise-animation">
      <div className="exercise-demo-image-frame" aria-busy={playing && !ready}>
        <img className="exercise-demo-image" src={media.poster} alt={t('exerciseDemo')} />
        {playing && visible && (
          <img
            className="exercise-demo-image exercise-demo-gif"
            src={media.gif || '/' + animation}
            alt={t('exerciseDemo')}
            onLoad={() => setReady(true)}
            onError={onError}
          />
        )}
        {playing && !ready && (
          <span role="status" className="exercise-gif-loading">
            {t('loadingDemo')}
          </span>
        )}
      </div>
      <div className="exercise-demo-actions">
        <button
          type="button"
          className="button secondary"
          aria-label={t(playing ? 'pauseDemo' : 'playDemo')}
          aria-pressed={playing}
          onClick={() => setPlaying(!playing)}
        >
          {t(playing ? 'pauseDemo' : 'playDemo')}
        </button>
      </div>
    </div>
  );
}

const metrics = ['weight', 'reps', 'estimate', 'volume'] as const;
type Metric = (typeof metrics)[number];
type Values = Record<Metric, number | null>;
type Result = {
  records: { exerciseId: string; _max: Values }[];
  history: (Values & { sessionId: string; finishedAt: string })[];
};
export function PersonalRecords({
  exerciseId,
  userId,
  compact = false,
}: {
  exerciseId?: string;
  userId?: string;
  compact?: boolean;
}) {
  const { library, t, lang, number, formatDate } = useNutri();
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [metric, setMetric] = useState<Metric>('weight');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedExercise = library.exercises.find((exercise) => exercise.id === selectedId);
  useEffect(() => {
    let current = true;
    const params = new URLSearchParams();
    if (exerciseId) params.set('exerciseId', exerciseId);
    if (userId) params.set('userId', userId);
    api<Result>(`performance?${params}`)
      .then((result) => {
        if (current) setData(result);
      })
      .catch((err: Error) => {
        if (current) setError(err.message);
      });
    return () => {
      current = false;
    };
  }, [exerciseId, userId, retry]);
  return (
    <section className="record-section">
      <h3>{t('personalRecords')}</h3>
      {error ? (
        <div role="alert">
          <p>{t(error)}</p>
          <button
            className="button secondary"
            onClick={() => {
              setError('');
              setRetry(retry + 1);
            }}
          >
            {t('retry')}
          </button>
        </div>
      ) : !data ? (
        <p role="status">{t('loading')}</p>
      ) : !data.records.length ? (
        <Empty text={t('noRecordsYet')} />
      ) : compact ? (
        <div className="record-shortcuts">
          {data.records.map((record) => {
            const exercise = library.exercises.find((item) => item.id === record.exerciseId);
            return (
              <button
                type="button"
                className="record-shortcut"
                key={record.exerciseId}
                onClick={() => setSelectedId(record.exerciseId)}
                aria-haspopup="dialog"
              >
                <span>
                  {exercise
                    ? lang === 'he'
                      ? exercise.nameHe
                      : exercise.nameEn
                    : record.exerciseId}
                </span>
                <strong>
                  {number(record._max.weight ?? 0)} {t('kg')}
                </strong>
              </button>
            );
          })}
        </div>
      ) : (
        data.records.map((record) => {
          const exercise = library.exercises.find((item) => item.id === record.exerciseId);
          return (
            <div key={record.exerciseId}>
              {!exerciseId && exercise && (
                <h4>{lang === 'he' ? exercise.nameHe : exercise.nameEn}</h4>
              )}
              <dl className="record-metrics">
                {metrics.map((key) => (
                  <div key={key}>
                    <dt>{t(key === 'estimate' ? 'estimatedMax' : key)}</dt>
                    <dd>
                      {number(Math.round((record._max[key] ?? 0) * 10) / 10)}{' '}
                      {key !== 'reps' && t('kg')}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })
      )}
      {!compact && data && data.history.length > 1 && (
        <>
          <label>
            {t('history')}
            <select value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>
              {metrics.map((key) => (
                <option key={key} value={key}>
                  {t(key === 'estimate' ? 'estimatedMax' : key)}
                </option>
              ))}
            </select>
          </label>
          <div dir="ltr" className="record-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={[...data.history].reverse().map((row) => ({
                  ...row,
                  day: formatDate(row.finishedAt, { month: 'short', day: 'numeric' }),
                }))}
              >
                <XAxis dataKey="day" minTickGap={24} />
                <YAxis width={35} />
                <Tooltip />
                <Line
                  dataKey={metric}
                  name={t(metric === 'estimate' ? 'estimatedMax' : metric)}
                  stroke="var(--green, #16715b)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      {selectedId && (
        <Modal
          title={
            selectedExercise
              ? lang === 'he'
                ? selectedExercise.nameHe
                : selectedExercise.nameEn
              : t('personalRecords')
          }
          onClose={() => setSelectedId(null)}
          className="record-details-modal"
        >
          <PersonalRecords key={selectedId} exerciseId={selectedId} userId={userId} />
        </Modal>
      )}
    </section>
  );
}
