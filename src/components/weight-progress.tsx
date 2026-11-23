'use client';

import { useState } from 'react';
import { Scale } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { weightMetrics } from '@/lib/weight-metrics';
import { Modal, useNutri } from './workspace';
import { Bodyweight } from './bodyweight';

export function WeightProgress() {
  const { state, t, number, lang } = useNutri();
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  const [updating, setUpdating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [month, setMonth] = useState(() =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: state.profile?.timezone || 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(new Date())
      .slice(0, 7),
  );
  const { latest, entries, average } = weightMetrics(state.progress, month);
  // Check-in dates are calendar dates; format in UTC to avoid shifting the day.
  const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
      new Date(`${date}T00:00:00Z`),
    );
  return (
    <section className="panel weight-overview" aria-label={t('weightOverview')}>
      <div className="section-heading weight-overview-heading">
        <h2>
          <Scale size={21} aria-hidden="true" />
          {t('weightOverview')}
        </h2>
        <button
          className="button primary"
          onClick={() => {
            setSaved(false);
            setUpdating(true);
          }}
        >
          {t('updateBodyweight')}
        </button>
      </div>
      <div className="weight-overview-layout">
        <div className="weight-latest">
          <span>{t('latestWeight')}</span>
          <div className="weight-hero-value">
            {latest ? number(latest.value) : '—'} <small>{t('kg')}</small>
          </div>
          <p className="muted small-copy">
            {latest
              ? dateLabel(latest.date, { day: 'numeric', month: 'short', year: 'numeric' })
              : t('weightStartHint')}
          </p>
        </div>
        <div className="weight-monthly">
          <label className="weight-month-picker">
            <span>{t('monthlyWeightTrend')}</span>
            <input
              type="month"
              value={month}
              required
              onChange={(event) => {
                if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value);
              }}
            />
          </label>
          <div className="weight-average" role="group" aria-label={t('monthlyAverageWeight')}>
            <span>{t('monthlyAverageWeight')}</span>
            <strong>
              {average === undefined ? '—' : number(average)} <small>{t('kg')}</small>
            </strong>
            <span className="muted small-copy">
              {t('weightCheckins')}: {number(entries.length)}
            </span>
          </div>
        </div>
      </div>
      {entries.length ? (
        <div className="chart weight-month-chart" role="img" aria-label={t('monthlyWeightTrend')}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={entries} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 4" stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(date: string) =>
                  dateLabel(date, { day: 'numeric', month: 'short' })
                }
                tick={{ fontSize: 11, fill: 'var(--muted)' }}
                minTickGap={24}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 11, fill: 'var(--muted)' }}
                tickFormatter={number}
                width={48}
              />
              <Tooltip
                labelFormatter={(date) =>
                  dateLabel(String(date), { day: 'numeric', month: 'long' })
                }
                formatter={(value) => [`${number(Number(value))} ${t('kg')}`, t('weight')]}
                contentStyle={{
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                }}
              />
              <Line
                isAnimationActive={false}
                type="linear"
                dataKey="value"
                name={t('weight')}
                stroke="var(--green)"
                strokeWidth={3}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="weight-month-empty">{t('noMonthlyWeights')}</p>
      )}
      {saved && <p role="status">{t('bodyweightSaved')}</p>}
      {updating && (
        <Modal
          title={t('updateBodyweight')}
          onClose={() => setUpdating(false)}
          className="weight-update-modal"
        >
          <Bodyweight
            compact
            onSaved={() => {
              setUpdating(false);
              setSaved(true);
            }}
          />
        </Modal>
      )}
    </section>
  );
}
