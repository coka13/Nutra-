/** Key used to treat two foods as the same item: the name without punctuation, quotes or spaces. */
export function foodNameKey(name: string) {
  return name
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[^\p{L}\p{N}%]+/gu, '');
}

type Dedupable = {
  source: string;
  brand?: string | null;
  nameEn: string;
  nameHe: string;
  calories: number;
  fiber: number;
};

/**
 * Keeps one food per name. Preference: the user's own / original foods, then generic foods
 * (Tzameret, then USDA), then unbranded over branded, then the record whose calories are the
 * median of its group (a typical one).
 */
export function dedupeFoods<T extends Dedupable>(foods: T[], name: (f: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const f of foods) {
    const key = foodNameKey(name(f));
    const group = groups.get(key);
    if (group) group.push(f);
    else groups.set(key, [f]);
  }
  const SOURCE: Record<string, number> = {
    'user-estimate': 0,
    'original-estimate': 1,
    tzameret: 2,
    usda: 3,
    openfoodfacts: 4,
  };
  const rank = (f: T) => (SOURCE[f.source] ?? 5) * 2 + (f.brand ? 1 : 0);
  const keep = new Set<T>();
  for (const group of groups.values()) {
    if (group.length === 1) {
      keep.add(group[0]);
      continue;
    }
    const best = Math.min(...group.map(rank));
    const candidates = group.filter((f) => rank(f) === best);
    const sorted = [...candidates].sort((a, b) => a.calories - b.calories);
    const median = sorted[Math.floor((sorted.length - 1) / 2)];
    // Among records with the median calories, prefer one that includes fibre.
    keep.add(sorted.find((f) => f.calories === median.calories && f.fiber > 0) ?? median);
  }
  return foods.filter((f) => keep.has(f)); // original order
}
