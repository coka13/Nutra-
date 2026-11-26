'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Leaf, Loader2, Search } from 'lucide-react';
import type { FoodWithUnits as Food } from '@/lib/types';
import { foodNameKey } from '@/lib/food-dedupe';
import { api, useNutri } from './workspace';

/**
 * One search box over the user's own foods and the bundled local food database
 * (Hebrew and English). Searching never leaves this server.
 */
export function FoodPicker({
  onPick,
  autoFocus = true,
}: {
  onPick: (food: Food) => void;
  autoFocus?: boolean;
}) {
  const { library, lang, t } = useNutri();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const foodName = (f: Food) => (lang === 'he' ? f.nameHe : f.nameEn);

  const q = search.trim().toLowerCase();
  const mine = useMemo(
    () =>
      library.foods
        .filter((f) => `${f.nameEn} ${f.nameHe} ${f.brand ?? ''}`.toLowerCase().includes(q))
        .slice(0, q ? 15 : 25),
    [library.foods, q],
  );

  useEffect(() => {
    setError('');
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setResults([]);
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api<{ results: Food[] }>(
          `foods/search?q=${encodeURIComponent(search.trim())}`,
        );
        if (!cancelled) setResults(data.results);
      } catch (e) {
        if (!cancelled) {
          setResults([]);
          setError(e instanceof Error ? e.message : 'serverError');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, search]);

  // Hide database foods whose visible name matches one of the user's own foods.
  const mineNames = new Set(mine.map((f) => foodNameKey(foodName(f))));
  const database = results.filter((f) => !mineNames.has(foodNameKey(foodName(f))));
  const macros = (f: Food) =>
    `${Math.round(f.calories)} ${t('kcal')} · ${t('protein')} ${f.protein} · ${t('carbs')} ${f.carbs} · ${t('fat')} ${f.fat} · ${t('per100')}`;
  const row = (f: Food) => (
    <button
      type="button"
      className="library-add-row full"
      key={f.id}
      onClick={() => onPick(f)}
    >
      <span className="food-icon">
        <Leaf size={17} />
      </span>
      <span className="grow">
        <strong>{foodName(f)}</strong>
        <small>
          {f.brand ? `${f.brand} · ` : ''}
          {macros(f)}
        </small>
      </span>
      <ChevronRight size={16} className="directional-icon" />
    </button>
  );

  return (
    <div className="food-picker">
      <div className="search-field">
        <Search size={17} />
        <input
          autoFocus={autoFocus}
          aria-label={t('searchFoods')}
          placeholder={t('searchFoodsLocal')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
        />
        {loading && <Loader2 className="spin" size={16} />}
      </div>
      <div className="food-search-results">
        {mine.length > 0 && <span className="picker-caption">{t('myFoods')}</span>}
        {mine.map(row)}
        {q && database.length > 0 && mine.length > 0 && (
          <span className="picker-caption">{t('foodDatabase')}</span>
        )}
        {database.map(row)}
        {q && !loading && !database.length && !mine.length && !error && (
          <p className="muted small-copy">{t('noResults')}</p>
        )}
        {error && <p className="form-error small-copy">{t(error)}</p>}
      </div>
      <p className="muted small-copy picker-attribution">{t('foodDataAttribution')}</p>
    </div>
  );
}
