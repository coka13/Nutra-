/**
 * Translates public food/product names between English and Hebrew.
 * Only catalog names from the online databases are sent — never user records or queries.
 * Any failure falls back to the original name.
 */
const HEBREW = /[֐-׿]/;
export const hasHebrew = (s: string) => HEBREW.test(s);

const cache = new Map<string, string>();
const key = (to: 'he' | 'en', text: string) => `${to}:${text.toLowerCase()}`;

async function callTranslate(text: string, to: 'he' | 'en') {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: to === 'he' ? 'auto' : 'iw',
    tl: to === 'he' ? 'iw' : 'en',
    dt: 't',
    q: text,
  });
  const r = await fetch('https://translate.googleapis.com/translate_a/single?' + params, {
    signal: AbortSignal.timeout(6000),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error('translate ' + r.status);
  const data = (await r.json()) as [[string | null][]];
  return data[0].map((part) => part[0] || '').join('');
}

/** Strips USDA jargon that machine translation renders badly. */
function cleanEn(s: string) {
  return s
    .replace(/\(Includes foods for USDA's Food Distribution Program\)/gi, '')
    .replace(/,?\s*broilers or fryers/gi, '')
    .replace(/,?\s*meat only/gi, '')
    .replace(/,?\s*NFS\b/g, '')
    .replace(/,?\s*ns as to [^,]+/gi, '')
    // Words the translator misreads in food context.
    .replace(/\bcommercial\b/gi, 'store-bought')
    .replace(/\bbreaded\b/gi, 'coated in breadcrumbs')
    .replace(/\btenders or strips\b/gi, 'strips')
    .replace(/\bpuffed\b/gi, 'puffed snack')
    .replace(/\bfrom restaurant\b/gi, 'restaurant-style')
    .replace(/\s+,/g, ',')
    .replace(/,\s*$/, '')
    .trim();
}

/**
 * Food words machine translation gets wrong (e.g. "Skyr" → "sky"). Before translating they are
 * swapped for opaque tokens the translator leaves alone; afterwards the tokens become Hebrew.
 */
const GLOSSARY: [RegExp, string][] = [
  [/\bskyr\b/gi, 'סקייר'],
  [/\b(pur|nature|natur)\b/gi, 'טבעי'],
  [/\blabneh\b/gi, 'לבנה'],
  [/\bquark\b/gi, 'קווארק'],
  [/\bkefir\b/gi, 'קפיר'],
  [/\bmuesli\b/gi, 'מוזלי'],
  [/\bgranola\b/gi, 'גרנולה'],
];
const token = (i: number) => `QX${i}Q`;
function glossary(s: string) {
  GLOSSARY.forEach(([pattern], i) => (s = s.replace(pattern, ` ${token(i)} `)));
  return s.replace(/\s+/g, ' ').trim();
}
function restoreGlossary(s: string) {
  GLOSSARY.forEach(([, word], i) => (s = s.replace(new RegExp(token(i), 'gi'), word)));
  return s;
}
/** Food-specific wording fixes after machine translation. */
function polishHe(s: string) {
  return restoreGlossary(s)
    .replace(/\s+/g, ' ')
    .replace(/^(דגים|דג),\s*/, '')
    .replace(/(^|\s)סקיר(?=\s|$)/g, '$1סקייר')
    .trim();
}

/** Translates many names in one request; returns originals for anything that fails. */
export async function translateNames(names: string[], to: 'he' | 'en'): Promise<string[]> {
  const missing = [...new Set(names.filter((n) => n.trim() && !cache.has(key(to, n))))];
  // Chunk to keep URLs short.
  for (let start = 0; start < missing.length; start += 25) {
    const chunk = missing.slice(start, start + 25);
    try {
      const joined = chunk
        .map((n, i) => `[[${i}]] ${(to === 'he' ? glossary(cleanEn(n)) : n).replace(/\[\[|\]\]/g, '')}`)
        .join('\n');
      const translated = await callTranslate(joined, to);
      const parts = translated.split(/\[\[\s*(\d+)\s*\]\]/);
      // parts: [prefix, index, text, index, text, ...]
      for (let i = 1; i < parts.length; i += 2) {
        const original = chunk[Number(parts[i])];
        const value = (parts[i + 1] || '').trim();
        if (original && value) cache.set(key(to, original), to === 'he' ? polishHe(value) : value);
      }
    } catch {
      /* fall back to originals */
    }
  }
  if (cache.size > 5000) cache.clear();
  return names.map((n) => cache.get(key(to, n)) ?? n);
}

/** Ensures a food has a real Hebrew name and a real English name. */
export async function localizeFoodNames<T extends { nameEn: string; nameHe: string }>(
  foods: T[],
): Promise<T[]> {
  const needHe = foods.filter((f) => !hasHebrew(f.nameHe));
  const needEn = foods.filter((f) => hasHebrew(f.nameEn));
  const [he, en] = await Promise.all([
    translateNames(
      needHe.map((f) => f.nameEn),
      'he',
    ),
    translateNames(
      needEn.map((f) => f.nameHe || f.nameEn),
      'en',
    ),
  ]);
  const heMap = new Map(needHe.map((f, i) => [f, he[i]]));
  const enMap = new Map(needEn.map((f, i) => [f, en[i]]));
  return foods.map((f) => ({
    ...f,
    nameHe: (heMap.get(f) ?? f.nameHe).slice(0, 200),
    nameEn: (enMap.get(f) ?? f.nameEn).slice(0, 200),
  }));
}
