'use client';

import { useEffect, useState } from 'react';
import { api, Empty, Form, Submit, useNutri } from './workspace';

export async function encodePhoto(file: File) {
  if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) throw new Error('photoError');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('photoError');
  });
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('photoError');
    for (const width of [720, 540, 400, 300]) {
      const scale = Math.min(1, width / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const encoded = canvas.toDataURL('image/jpeg', 0.72).split(',')[1];
      if (encoded && encoded.length <= 95000) return encoded;
    }
    throw new Error('photoError');
  } finally {
    bitmap.close();
  }
}

export function ProgressPhotos({ userId }: { userId?: string }) {
  const { t, formatDate, state, refresh } = useNutri();
  const [items, setItems] = useState<{ id: string; createdAt: string }[]>();
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [removing, setRemoving] = useState('');
  const query = userId ? `userId=${encodeURIComponent(userId)}` : '';
  useEffect(() => {
    let current = true;
    api<NonNullable<typeof items>>(`progress/photos?${query}`)
      .then((photos) => {
        if (current) {
          setItems(photos);
          setError('');
        }
      })
      .catch((cause: Error) => {
        if (current) {
          setItems(undefined);
          setError(cause.message);
        }
      });
    return () => {
      current = false;
    };
  }, [query, version, state.progress]);
  return (
    <section className="panel">
      <h3>{t('progressPhotos')}</h3>
      {error && (
        <p role="alert" className="form-error">
          {t(error)}{' '}
          <button className="text-button" onClick={() => setVersion(version + 1)}>
            {t('retry')}
          </button>
        </p>
      )}
      {!error && !items && <p role="status">{t('loading')}</p>}
      {!userId && (
        <Form
          onSubmit={async (values) => {
            const file = values.get('photo');
            if (!(file instanceof File)) throw new Error('photoError');
            await api('progress/photos', { image: await encodePhoto(file) });
            setVersion(version + 1);
            await refresh();
          }}
        >
          <label>
            {t('addPhoto')}
            <input type="file" name="photo" accept="image/*" required />
          </label>
          <Submit>{t('save')}</Submit>
        </Form>
      )}
      {items?.length === 0 && <Empty text={t('noPhotosYet')} />}
      <div className="progress-photo-grid">
        {items?.map((photo) => (
          <figure key={photo.id}>
            <img
              loading="lazy"
              src={`/api/progress/photos?${query}&id=${photo.id}`}
              alt={t('progressPhotos')}
            />
            <figcaption>{formatDate(photo.createdAt)}</figcaption>
            {!userId &&
              (removing === photo.id ? (
                <div className="row wrap">
                  <button
                    className="text-button danger-text"
                    onClick={async () => {
                      try {
                        await api('progress/photos/delete', { id: photo.id });
                        setRemoving('');
                        setVersion(version + 1);
                        await refresh();
                      } catch (cause) {
                        setError(cause instanceof Error ? cause.message : 'serverError');
                      }
                    }}
                  >
                    {t('remove')}
                  </button>
                  <button className="text-button" onClick={() => setRemoving('')}>
                    {t('cancel')}
                  </button>
                </div>
              ) : (
                <button className="text-button" onClick={() => setRemoving(photo.id)}>
                  {t('remove')}
                </button>
              ))}
          </figure>
        ))}
      </div>
    </section>
  );
}
