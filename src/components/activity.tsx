'use client';
import { useEffect, useRef, useState } from 'react';
import { healthSyncInput, type ActivitySummary } from '@/lib/activity';
import { clientId } from '@/lib/client-id';
import { api, DatePicker, PageHeading, useNutri } from './workspace';

export function ActivityView() {
  const { t, date, lang, state, number } = useNutri();
  const [data, setData] = useState<ActivitySummary | null>(null);
  const [error, setError] = useState('');
  const [native, setNative] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [consent, setConsent] = useState(false);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    api<ActivitySummary>('activity?date=' + date)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [date, retry]);
  useEffect(() => {
    setNative('ReactNativeWebView' in window);
    const receive = async (event: Event) => {
      const result = (event as CustomEvent).detail;
      if (
        !pending.current ||
        result?.requestId !== pending.current ||
        result?.userId !== state.user.id
      )
        return;
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      try {
        if (result.error) throw new Error(result.error);
        const snapshot = healthSyncInput.parse(result.snapshot);
        if (snapshot.date !== date) throw new Error('invalid');
        await api('activity', { action: 'sync', expectedUserId: state.user.id, ...snapshot });
        setRetry((value) => value + 1);
      } catch (err) {
        setError(err instanceof Error && !('issues' in err) ? err.message : 'invalid');
      } finally {
        setBusy(false);
      }
    };
    window.addEventListener('nutra-health-result', receive);
    return () => {
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      setBusy(false);
      window.removeEventListener('nutra-health-result', receive);
    };
  }, [state.user.id, date]);
  const refresh = () => setRetry((value) => value + 1);
  const workoutMinutes = data?.activities.reduce((sum, item) => sum + item.minutes, 0) ?? 0;
  const workoutDistance =
    data?.activities.reduce((sum, item) => sum + (item.distanceKm || 0), 0) ?? 0;
  // Prefer the whole-day distance from the health app; fall back to workout distances.
  const distance = !data
    ? null
    : (data.steps?.distanceKm ?? Math.round(workoutDistance * 100) / 100);
  async function removeImported() {
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    setBusy(false);
    setConsent(false);
    try {
      await api('activity', { action: 'disconnect' });
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <>
      <PageHeading title={t('activity')} subtitle={t('activitySub')}>
        <DatePicker />
      </PageHeading>
      {error && (
        <p className="form-error" role="alert">
          {t(error)}{' '}
          <button className="text-button" onClick={refresh}>
            {t('retry')}
          </button>
        </p>
      )}
      <div className="activity-summary">
        <section className="panel">
          <span className="eyebrow">{t('dailySteps')}</span>
          <h2>{data?.steps ? number(data.steps.steps) : '—'}</h2>
          <p className="muted">{data?.steps ? t(data.steps.source) : t('noStepsSynced')}</p>
          {data?.steps && (
            <small>
              {t('lastSync')}{' '}
              {new Date(data.steps.syncedAt).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </small>
          )}
        </section>
        <section className="panel">
          <span className="eyebrow">{t('activeCalories')}</span>
          <h2>{data?.steps?.activeCalories != null ? number(data.steps.activeCalories) : '—'}</h2>
          <p className="muted">
            {data?.steps?.activeCalories != null
              ? `${t('kcal')} · ${t('activeCaloriesHint')}`
              : t('notSynced')}
          </p>
        </section>
        <section className="panel">
          <span className="eyebrow">{t('aerobicMinutes')}</span>
          <h2>{data ? number(Math.round(workoutMinutes)) : '—'}</h2>
          <p className="muted">{t('minutes')}</p>
        </section>
        <section className="panel">
          <span className="eyebrow">{t('distance')}</span>
          <h2>{distance !== null ? number(distance) : '—'}</h2>
          <p className="muted">{t('km')}</p>
        </section>
      </div>
      <section className="panel activity-connect">
        <h2>{t('fitnessConnection')}</h2>
        <p>{t('healthReadExplanation')}</p>
        {native ? (
          <>
            <label className="check-label">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              {t('healthConsent')}
            </label>
            <button
              className="button primary"
              disabled={busy || !consent}
              onClick={() => {
                const bridge = (
                  window as Window & {
                    ReactNativeWebView?: { postMessage: (message: string) => void };
                  }
                ).ReactNativeWebView;
                if (!bridge) return;
                const requestId = clientId();
                pending.current = requestId;
                setBusy(true);
                setError('');
                timer.current = setTimeout(() => {
                  pending.current = null;
                  setBusy(false);
                  setError('healthTimeout');
                }, 120000);
                bridge.postMessage(
                  JSON.stringify({ type: 'health-sync', requestId, userId: state.user.id, date }),
                );
              }}
            >
              {busy ? t('syncingHealth') : t('syncHealth')}
            </button>
          </>
        ) : (
          <p className="muted">{t('healthPhoneOnly')}</p>
        )}
        <p className="small-copy muted">{t('stepDeduplication')}</p>
        <button className="text-button" onClick={removeImported} disabled={busy}>
          {t('removeHealthData')}
        </button>
        <p className="small-copy muted">{t('revokeHealthPermissions')}</p>
      </section>
      <section className="panel">
        <h2>{t('aerobicLog')}</h2>
        {!data ? (
          <p role="status">{t('loading')}</p>
        ) : !data.activities.length ? (
          <p className="muted">{t('noAerobicActivity')}</p>
        ) : (
          data.activities.map((item) => (
            <div className="activity-log-row" key={item.id}>
              <div>
                <strong>{t(item.kind)}</strong>
                <p>
                  {number(Math.round(item.minutes))} {t('min')}
                  {item.distanceKm != null ? ` · ${number(item.distanceKm)} ${t('km')}` : ''}
                </p>
                <small className="muted">{t(item.source)}</small>
              </div>
            </div>
          ))
        )}
      </section>
    </>
  );
}
