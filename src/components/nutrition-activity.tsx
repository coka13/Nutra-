'use client';
import { useEffect, useRef, useState } from 'react';
import type { ActivitySummary } from '@/lib/activity';
import { api, useNutri } from './workspace';

export function NutritionActivity() {
  const { date, t, number, navigate, state } = useNutri();
  const [data, setData] = useState<ActivitySummary | null>(null);
  const [error, setError] = useState('');
  const previousDate = useRef(date);
  useEffect(() => {
    let active = true;
    // Keep the last value during background refreshes; clear only for a new day.
    if (previousDate.current !== date) setData(null);
    previousDate.current = date;
    setError('');
    api<ActivitySummary>('activity?date=' + date)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [date, state.clockAt]);
  return (
    <section className="panel nutrition-burned">
      <div>
        <h2>{t('caloriesBurned')}</h2>
        <strong>
          {data?.steps?.activeCalories != null
            ? `${number(data.steps.activeCalories)} ${t('kcal')}`
            : '—'}
        </strong>
        <p className="muted">
          {error
            ? t(error)
            : data?.steps?.activeCalories != null
              ? t('activeCaloriesHint')
              : t('notSynced')}
        </p>
      </div>
      <button className="button secondary" onClick={() => navigate('activity')}>
        {t('stepsAndActivity')}
      </button>
    </section>
  );
}
