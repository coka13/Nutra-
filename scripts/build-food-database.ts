/**
 * ONE-TIME build of the bundled food database. Run: npm run catalog:foods
 *
 * Downloads public datasets, keeps plausible per-100 g records, translates names
 * (English ↔ Hebrew) and writes src/data/food-database.json. Translations are cached in
 * src/data/food-translations.json so re-runs only translate new names (resumable).
 * Afterwards load it into the database with `npm run db:foods` — the app itself never
 * calls these services.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  brandSet,
  fromOff,
  fromTzameret,
  fromUsda,
  type ExternalFood,
  type OffProduct,
  type TzameretRow,
  type UsdaFood,
} from '../src/lib/food-sources';
import { hasHebrew, translateNames } from './food-translate';
import { dedupeFoods } from '../src/lib/food-dedupe';
import { tzameretUnits } from './tzameret-units';
import { pickHebrewUnit } from './food-unit-names';

const WORK = path.resolve('tmp/food-build');
const OUT = path.resolve('src/data/food-database.json');
const TRANSLATIONS = path.resolve('src/data/food-translations.json');
const USDA = [
  // [file, top-level key]
  ['FoodData_Central_foundation_food_json_2026-10-29.zip', 'FoundationFoods'],
  ['FoodData_Central_survey_food_json_2024-10-31.zip', 'SurveyFoods'],
] as const;
const UA = 'FituraPlus/0.1 (one-time food database build)';

async function exists(p: string) {
  return fs.stat(p).then(
    () => true,
    () => false,
  );
}

async function download(url: string, file: string) {
  if (await exists(file)) return;
  console.log('downloading', url);
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  await fs.writeFile(file + '.part', Buffer.from(await r.arrayBuffer()));
  await fs.rename(file + '.part', file);
}

function unzip(zip: string, dir: string) {
  // bsdtar (Windows 10+, macOS) reads zip; Linux images usually have unzip.
  try {
    execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
  } catch {
    execFileSync('tar', ['-xf', zip, '-C', dir]);
  }
}

type UsdaWithPortions = UsdaFood & {
  foodPortions?: { portionDescription?: string; gramWeight?: number }[];
};
/** FNDDS household portions ("1 tablespoon" = 14 g). Hebrew labels are filled in later. */
function usdaPortions(raw: UsdaWithPortions) {
  const units: { he: string; en: string; g: number }[] = [];
  for (const p of raw.foodPortions ?? []) {
    const label = (p.portionDescription ?? '').replace(/\s+/g, ' ').trim().replace(/^1\s+/, '');
    const g = p.gramWeight ?? 0;
    if (!label || g <= 0 || g > 3000) continue;
    if (/not specified|guideline amount|^nfs$/i.test(label)) continue;
    if (units.some((u) => u.en.toLowerCase() === label.toLowerCase())) continue;
    units.push({ he: '', en: label.slice(0, 80), g: Math.round(g * 10) / 10 });
    if (units.length >= 8) break;
  }
  return units;
}

async function usdaFoods() {
  const foods: ExternalFood[] = [];
  for (const [file, key] of USDA) {
    const zip = path.join(WORK, file);
    await download(`https://fdc.nal.usda.gov/fdc-datasets/${file}`, zip);
    const dir = path.join(WORK, file.replace('.zip', ''));
    await fs.mkdir(dir, { recursive: true });
    if (!(await fs.readdir(dir)).length) unzip(zip, dir);
    const json = (await fs.readdir(dir)).find((f) => f.endsWith('.json'));
    if (!json) throw new Error('no JSON inside ' + file);
    const data = JSON.parse(await fs.readFile(path.join(dir, json), 'utf8')) as Record<string, UsdaFood[]>;
    const parsed = (data[key] || [])
      .map((raw): ExternalFood | null => {
        const f = fromUsda(raw);
        return f && { ...f, units: usdaPortions(raw as UsdaWithPortions) };
      })
      .filter((f): f is ExternalFood => !!f);
    console.log(`${key}: ${parsed.length} / ${(data[key] || []).length} usable`);
    foods.push(...parsed);
  }
  return foods;
}

async function israeliProducts() {
  const cache = path.join(WORK, 'off-israel.json');
  if (await exists(cache)) return JSON.parse(await fs.readFile(cache, 'utf8')) as OffProduct[];
  const fields = 'code,product_name,product_name_en,product_name_he,brands,nutriments';
  const all: OffProduct[] = [];
  for (let page = 1; ; page++) {
    const url =
      'https://search.openfoodfacts.org/search?q=' +
      encodeURIComponent('countries_tags:"en:israel"') +
      `&page_size=100&page=${page}&fields=${fields}`;
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`Open Food Facts page ${page} → HTTP ${r.status}`);
    const data = (await r.json()) as { hits: OffProduct[]; page_count: number };
    all.push(...data.hits);
    process.stdout.write(`\rOpen Food Facts Israel: page ${page}/${data.page_count}`);
    if (page >= data.page_count || !data.hits.length) break;
    await new Promise((res) => setTimeout(res, 700)); // be polite
  }
  console.log();
  await fs.writeFile(cache, JSON.stringify(all));
  return all;
}

/** Tzameret — Israel Ministry of Health food composition data (data.gov.il datastore API). */
async function tzameretFoods(brands: Set<string>) {
  const cache = path.join(WORK, 'tzameret.json');
  let rows: TzameretRow[];
  if (await exists(cache)) rows = JSON.parse(await fs.readFile(cache, 'utf8'));
  else {
    rows = [];
    const resource = 'c3cb0630-0650-46c1-a068-82d575c094b2';
    const fields =
      'Code,shmmitzrach,english_name,food_energy,protein,total_fat,carbohydrates,total_dietary_fiber';
    for (let offset = 0; ; offset += 1000) {
      const url =
        `https://data.gov.il/api/3/action/datastore_search?resource_id=${resource}` +
        `&limit=1000&offset=${offset}&fields=${fields}`;
      // data.gov.il's CDN rejects requests without a browser-like User-Agent.
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 ' + UA } });
      if (!r.ok) throw new Error(`Tzameret offset ${offset} → HTTP ${r.status}`);
      const data = (await r.json()) as { result: { records: TzameretRow[]; total: number } };
      rows.push(...data.result.records);
      process.stdout.write(`\rTzameret: ${rows.length}/${data.result.total}`);
      if (!data.result.records.length || rows.length >= data.result.total) break;
      await new Promise((res) => setTimeout(res, 500));
    }
    console.log();
    await fs.writeFile(cache, JSON.stringify(rows));
  }
  const parsed = rows.map((r) => fromTzameret(r, brands)).filter((f): f is ExternalFood => !!f);
  console.log(`Tzameret: brand moved out of the name for ${parsed.filter((f) => f.brand).length} foods`);
  console.log(`Tzameret: ${parsed.length} / ${rows.length} usable`);
  const units = await tzameretUnits(WORK, UA, rows, (names) => translateNames(names, 'en'));
  return parsed.map((f) => ({ ...f, units: units.get(f.externalId) ?? [] }));
}

async function main() {
  await fs.mkdir(WORK, { recursive: true });
  const usda = await usdaFoods();
  const offRaw = await israeliProducts();
  const off = offRaw.map(fromOff).filter((f): f is ExternalFood => !!f);
  console.log(`Open Food Facts Israel: ${off.length} / ${offRaw.length} usable`);

  // Deduplicate by source+id, then by identical name+macros.
  const seen = new Set<string>();
  const tzameret = await tzameretFoods(brandSet(off.map((f) => f.brand)));
  const foods = [...tzameret, ...usda, ...off].filter((f) => {
    const k1 = `${f.source}:${f.externalId}`;
    const k2 = `${f.nameEn.toLowerCase()}|${f.nameHe}|${f.calories}|${f.protein}`;
    if (seen.has(k1) || seen.has(k2)) return false;
    seen.add(k1);
    seen.add(k2);
    return true;
  });

  // ---- translations (cached + resumable) ----
  const saved: { he: Record<string, string>; en: Record<string, string> } = (await exists(TRANSLATIONS))
    ? JSON.parse(await fs.readFile(TRANSLATIONS, 'utf8'))
    : { he: {}, en: {} };
  const persist = () => fs.writeFile(TRANSLATIONS, JSON.stringify(saved, null, 1) + '\n');
  async function fill(direction: 'he' | 'en', names: string[]) {
    const todo = [...new Set(names)].filter((n) => !saved[direction][n]);
    console.log(`translating ${todo.length} names → ${direction}`);
    const BATCH = 25, PARALLEL = 3;
    for (let i = 0; i < todo.length; i += BATCH * PARALLEL) {
      const groups = Array.from({ length: PARALLEL }, (_, g) =>
        todo.slice(i + g * BATCH, i + (g + 1) * BATCH),
      ).filter((g) => g.length);
      const results = await Promise.all(groups.map((g) => translateNames(g, direction)));
      groups.forEach((g, gi) =>
        g.forEach((name, j) => {
          const value = results[gi][j];
          const ok = direction === 'he' ? hasHebrew(value) : !hasHebrew(value);
          if (ok) saved[direction][name] = value;
        }),
      );
      await persist();
      process.stdout.write(`\r  ${Math.min(i + BATCH * PARALLEL, todo.length)}/${todo.length}`);
      await new Promise((res) => setTimeout(res, 300));
    }
    console.log();
  }
  await fill('he', foods.filter((f) => !hasHebrew(f.nameHe)).map((f) => f.nameEn));
  await fill('en', foods.filter((f) => hasHebrew(f.nameEn)).map((f) => f.nameHe || f.nameEn));
  // Hebrew labels for USDA portion units ("tablespoon" → "כף").
  await fill(
    'he',
    foods.flatMap((f) => (f.units ?? []).filter((u) => !u.he).map((u) => u.en)),
  );
  for (const f of foods)
    for (const u of f.units ?? []) if (!u.he) u.he = pickHebrewUnit(u.en, saved.he[u.en]);

  const named = foods.map((f) => {
    const nameHe = hasHebrew(f.nameHe) ? f.nameHe : saved.he[f.nameEn] || f.nameEn;
    const nameEn = hasHebrew(f.nameEn) ? saved.en[f.nameHe || f.nameEn] || f.nameEn : f.nameEn;
    return { ...f, nameEn: nameEn.slice(0, 200), nameHe: nameHe.slice(0, 200) };
  });
  // One food per name, in both languages (no visually identical entries in the picker).
  const output = dedupeFoods(
    dedupeFoods(named, (f) => f.nameHe),
    (f) => f.nameEn,
  );
  console.log(`removed ${named.length - output.length} duplicate names`);
  const missingHe = output.filter((f) => !hasHebrew(f.nameHe)).length;
  await fs.writeFile(OUT, JSON.stringify(output) + '\n');
  console.log(`wrote ${output.length} foods to ${path.relative(process.cwd(), OUT)} (${missingHe} without Hebrew name)`);
  if (missingHe) console.log('Re-run `npm run catalog:foods` to retry the remaining translations.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
