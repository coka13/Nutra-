'use client';
import { useNutri } from './workspace';

export function LoadingCards({ count = 3 }: { count?: number }) {
  const { t } = useNutri();
  return (
    <div className="loading-cards" role="status" aria-label={t('loading')}>
      <span className="visually-hidden">{t('loading')}</span>
      {Array.from({ length: count }, (_, index) => (
        <div className="panel loading-card" key={index} aria-hidden="true">
          <div />
          <div />
          <div />
        </div>
      ))}
    </div>
  );
}
