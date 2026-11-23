'use client';

import { useEffect, useState } from 'react';
import { api, Empty, Form, Submit, useNutri } from './workspace';
import { encodePhoto } from './progress-photos';

type Entry = {
  id: string;
  value: number;
  date: string;
  note: string;
  photos: { id: string }[];
};

export function Bodyweight({
  userId,
  compact = false,
  onSaved,
}: {
  userId?: string;
  compact?: boolean;
  onSaved?: () => void;
}) {
  const { state, t, number, refresh } = useNutri();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: state.profile?.timezone || 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [date, setDate] = useState(today);
  const [entries, setEntries] = useState<Entry[]>();
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [saved, setSaved] = useState(false);
  const query = userId ? `userId=${encodeURIComponent(userId)}` : '';
  useEffect(() => {
    let current = true;
    api<Entry[]>(`progress/bodyweight?${query}`)
      .then((items) => {
        if (current) {
          setEntries(items);
          setError('');
        }
      })
      .catch((cause: Error) => {
        if (current) setError(cause.message);
      });
    return () => {
      current = false;
    };
  }, [query, version, state.progress]);
  const existing = entries?.find((entry) => entry.date === date);
  const connected = state.relationships.some(
    (link) => link.clientId === state.user.id && link.status === 'ACTIVE',
  );
  return (
    <section
      className={compact ? 'weight-update-form' : 'panel bodyweight-panel'}
      aria-label={t('dailyBodyweight')}
    >
      {!compact && (
        <div className="section-heading">
          <h2>{t('dailyBodyweight')}</h2>
        </div>
      )}
      {!userId && (
        <p className="muted small-copy">
          {t(connected ? 'bodyweightShared' : 'bodyweightPrivate')}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {t(error)}{' '}
          <button className="text-button" onClick={() => setVersion((v) => v + 1)}>
            {t('retry')}
          </button>
        </p>
      )}
      {!error && !entries && <p role="status">{t('loading')}</p>}
      {!userId && entries && (
        <Form
          key={`${date}-${existing?.id || 'new'}-${existing?.value}-${existing?.note}-${version}`}
          onSubmit={async (form) => {
            const files = form
              .getAll('photos')
              .filter((file): file is File => file instanceof File && file.size > 0);
            if (files.length > 3) throw new Error('bodyweightPhotoLimit');
            const images = await Promise.all(files.map(encodePhoto));
            await api('progress/bodyweight', {
              date,
              value: Number(form.get('value')),
              note: form.get('note'),
              images,
            });
            await refresh();
            const updated = await api<Entry[]>(`progress/bodyweight?${query}`);
            setEntries(updated);
            setVersion((v) => v + 1);
            setSaved(true);
            onSaved?.();
          }}
        >
          <div className="form-grid">
            <label>
              {t('logWeight')}
              <input
                name="value"
                type="number"
                inputMode="decimal"
                autoFocus={compact}
                onFocus={compact ? (event) => event.target.select() : undefined}
                min="0.1"
                max="700"
                step="0.1"
                defaultValue={
                  existing?.value ??
                  (compact
                    ? entries.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.value
                    : '') ??
                  ''
                }
                required
              />
            </label>
            <label>
              {t('date')}
              <input
                type="date"
                name="date"
                value={date}
                required
                onChange={(event) => {
                  setDate(event.target.value);
                  setSaved(false);
                }}
              />
            </label>
          </div>
          <details open={compact ? undefined : true} className="weight-optional-fields">
            <summary>{t('weightOptionalDetails')}</summary>
            <label>
              {t('notes')}
              <textarea name="note" maxLength={1000} defaultValue={existing?.note ?? ''} />
            </label>
            <label>
              {t('bodyweightOptionalPhotos')}
              <input name="photos" type="file" accept="image/*" multiple />
            </label>
            <p className="muted small-copy">{t('bodyweightPhotoHint')}</p>
          </details>
          <Submit>{t(existing ? 'updateBodyweight' : 'saveBodyweight')}</Submit>
        </Form>
      )}
      {saved && <p role="status">{t('bodyweightSaved')}</p>}
      {!compact && (
        <>
          <h3>{t('bodyweightHistory')}</h3>
          {entries?.length === 0 && <Empty text={t('noWeightYet')} />}
          <div className="bodyweight-history">
            {entries?.map((entry) => (
              <article key={entry.id} className="bodyweight-entry">
                <div className="row between wrap">
                  <time dateTime={entry.date}>{entry.date}</time>
                  <strong>
                    {number(entry.value)} {t('kg')}
                  </strong>
                  {!userId && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setDate(entry.date);
                        setSaved(false);
                      }}
                    >
                      {t('edit')}
                    </button>
                  )}
                </div>
                {entry.note && <p>{entry.note}</p>}
                <div className="progress-photo-grid">
                  {entry.photos.map((photo) => (
                    <figure key={photo.id}>
                      <a
                        href={`/api/progress/photos?${query}&id=${photo.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          loading="lazy"
                          src={`/api/progress/photos?${query}&id=${photo.id}`}
                          alt={`${t('progressPhotos')} · ${entry.date}`}
                        />
                      </a>
                      {!userId && (
                        <button
                          className="text-button"
                          onClick={async () => {
                            try {
                              await api('progress/photos/delete', { id: photo.id });
                              setVersion((v) => v + 1);
                              await refresh();
                            } catch (cause) {
                              setError(cause instanceof Error ? cause.message : 'serverError');
                            }
                          }}
                        >
                          {t('remove')}
                        </button>
                      )}
                    </figure>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
