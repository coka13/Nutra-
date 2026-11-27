'use client';

import type { CatalogPage } from './exercise-catalog';

export type CatalogFilters = { name?: string; category?: string; muscle?: string; offset?: number };
const pages = new Map<string, CatalogPage>();
const pending = new Map<string, Promise<CatalogPage>>();
// Retain the current and next page's decoded image resources across navigation.
const warmed = new Map<string, HTMLImageElement>();
const keyFor = (filters: CatalogFilters = {}) =>
  new URLSearchParams({
    name: filters.name || '',
    category: filters.category || '',
    muscle: filters.muscle || '',
    offset: String(filters.offset || 0),
  }).toString();

export function cachedCatalogPage(filters: CatalogFilters = {}) {
  return pages.get(keyFor(filters));
}

export function seedCatalogPage(page: CatalogPage) {
  pages.set(keyFor(), page);
}

export function loadCatalogPage(filters: CatalogFilters = {}, retry = false): Promise<CatalogPage> {
  const key = keyFor(filters);
  if (!retry && pages.has(key)) return Promise.resolve(pages.get(key)!);
  const existing = pending.get(key);
  if (existing) return existing;
  const request = fetch('/api/exercise-catalog?' + key, { cache: 'no-store' })
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'catalogUnavailable');
      pages.set(key, result);
      return result as CatalogPage;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

/**
 * Preloads the small still thumbnails (~15KB each) only. Animations are ~450KB each, so they
 * load when their card scrolls into view instead of on every app start.
 */
export function warmCatalogImages(page: CatalogPage) {
  for (const exercise of page.results) {
    const src = exercise.thumbnail;
    if (!src || warmed.has(src)) continue;
    const image = new Image();
    image.fetchPriority = 'low';
    warmed.set(src, image);
    image.onerror = () => warmed.delete(src);
    image.src = src;
    if (warmed.size > 72) warmed.delete(warmed.keys().next().value!);
  }
}
