/**
 * Household units for Tzameret foods (build time only).
 *
 * - Official unit weights: "טבלת משקל ליחידת מידה למצרך" (e.g. כף = 30 g, יחידה גדולה = 58 g).
 * - "ביצה" (per egg) for egg dishes (omelettes, fried eggs, shakshuka…): derived from the
 *   official recipe table. The cooked dish weight is found by protein balance (protein is not
 *   added by frying oil and survives cooking), then divided by the number of eggs in the recipe.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export type Unit = { he: string; en: string; g: number };
type Row = Record<string, string | number | null | undefined>;

const RESOURCES = {
  unitNames: '98fb46fe-e8de-4067-94d2-b0a8ea4269da',
  unitWeights: '755d28c0-75f7-40e1-9c8c-ecdd106f9b2d',
  recipes: '5c726506-5c1e-43a7-94f7-24845dbde9c3',
};

async function fetchTable(work: string, name: keyof typeof RESOURCES, ua: string): Promise<Row[]> {
  const cache = path.join(work, `tzameret-${name}.json`);
  try {
    return JSON.parse(await fs.readFile(cache, 'utf8'));
  } catch {
    /* not cached yet */
  }
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 5000) {
    const url =
      `https://data.gov.il/api/3/action/datastore_search?resource_id=${RESOURCES[name]}` +
      `&limit=5000&offset=${offset}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 ' + ua } });
    if (!r.ok) throw new Error(`Tzameret ${name} offset ${offset} → HTTP ${r.status}`);
    const data = (await r.json()) as { result: { records: Row[]; total: number } };
    rows.push(...data.result.records);
    if (!data.result.records.length || rows.length >= data.result.total) break;
    await new Promise((res) => setTimeout(res, 500));
  }
  await fs.writeFile(cache, JSON.stringify(rows));
  return rows;
}

const n = (v: unknown) => {
  const x = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(x) ? x : null;
};
const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** English labels for the unit vocabulary (108 entries; unknown ones fall back to translation). */
const UNIT_EN: Record<string, string> = {
  יחידה: 'unit', 'יחידה קטנה מאד': 'very small unit', 'יחידה קטנה': 'small unit',
  'יחידה בינונית': 'medium unit', 'יחידה גדולה': 'large unit', 'יחידה גדולה מאד': 'very large unit',
  כוס: 'cup', 'כוס מידה': 'measuring cup', ספל: 'mug', 'ספל למרק': 'soup mug', 'כוס ליין': 'wine glass',
  כף: 'tablespoon', 'כף שטוחה': 'level tablespoon', 'כף גדושה': 'heaped tablespoon',
  'כף לגלידה': 'ice-cream scoop', 'מצקת קטנה': 'small ladle', 'מצקת גדולה': 'large ladle',
  'כף מידה': 'measuring tablespoon', כפית: 'teaspoon', 'כפית שטוחה': 'level teaspoon',
  'כפית גדושה': 'heaped teaspoon', פרוסה: 'slice', 'פרוסה דקה': 'thin slice',
  'פרוסה בינונית': 'medium slice', 'פרוסה עבה': 'thick slice', גביע: 'cup (tub)',
  'גביע קטן': 'small tub', 'גביע בינוני': 'medium tub', 'גביע גדול': 'large tub', מנה: 'serving',
  'מנה קטנה': 'small serving', 'מנה בינונית': 'medium serving', 'מנה גדולה': 'large serving',
  אריזה: 'package', חבילה: 'pack', חפיסה: 'bar', שקית: 'bag', קופסה: 'box', צנצנת: 'jar',
  'אריזה אישית': 'single pack', 'צלחת קטנה': 'small plate', 'צלחת בינונית': 'medium plate',
  'צלחת גדולה': 'large plate', 'צלחת למרק': 'soup plate', 'קערית מרק': 'soup bowl', בקבוק: 'bottle',
  פחית: 'can', פלח: 'segment', משולש: 'triangle', 'ריבוע/ קוביה': 'cube', אצבע: 'finger',
  שן: 'clove', חופן: 'handful', חטיף: 'snack bar', לחמניה: 'roll', פיתה: 'pita',
  'פיתה ביתית': 'homemade pita', טבליה: 'piece', 'עיגול/כדור': 'ball', עלה: 'leaf', ראש: 'head',
  'פילה קטן': 'small fillet', 'פילה בינוני': 'medium fillet', 'פילה גדול': 'large fillet',
};

export async function tzameretUnits(
  work: string,
  ua: string,
  foods: { Code?: number | string; shmmitzrach?: string; protein?: unknown; food_energy?: unknown }[],
  translateToEn: (names: string[]) => Promise<string[]>,
) {
  const [unitNames, unitWeights, recipes] = await Promise.all([
    fetchTable(work, 'unitNames', ua),
    fetchTable(work, 'unitWeights', ua),
    fetchTable(work, 'recipes', ua),
  ]);
  const unitName = new Map(unitNames.map((u) => [String(u.smlmida), clean(u.shmmida)]));
  const unknown = [...new Set([...unitName.values()].filter((h) => !UNIT_EN[h]))];
  const translated = await translateToEn(unknown);
  const enOf = (he: string) => UNIT_EN[he] ?? translated[unknown.indexOf(he)] ?? he;

  const byCode = new Map(foods.map((f) => [String(f.Code), f]));
  const units = new Map<string, Unit[]>();

  // 1) Official unit weights (grams and kilograms are already covered by the gram input).
  for (const w of unitWeights) {
    const code = String(w.mmitzrach), mida = String(w.mida), g = n(w.mishkal);
    if (mida === '700' || mida === '2000' || !g || g <= 0 || g > 5000) continue;
    const he = unitName.get(mida);
    if (!he) continue;
    const list = units.get(code) ?? [];
    if (!list.some((u) => u.he === he)) list.push({ he, en: enOf(he), g });
    units.set(code, list);
  }

  // 2) Per-egg unit for egg dishes, from the recipe table.
  const eggCodes = new Set(
    foods.filter((f) => /^ביצה שלמה/.test(clean(f.shmmitzrach))).map((f) => String(f.Code)),
  );
  const ingredients = new Map<string, Row[]>();
  for (const r of recipes) {
    const list = ingredients.get(String(r.mmitzrach)) ?? [];
    list.push(r);
    ingredients.set(String(r.mmitzrach), list);
  }
  let eggDishes = 0;
  for (const [dish, rows] of ingredients) {
    const eggs = rows.filter((r) => eggCodes.has(String(r.mitzbsisi)));
    const food = byCode.get(dish);
    const dishProtein = n(food?.protein);
    if (!eggs.length || !food || !dishProtein || dishProtein < 2) continue;
    const eggCount = eggs.reduce((sum, r) => {
      const mida = Number(r.mida), kamut = n(r.kamut), g = n(r.mishkal) ?? 0;
      return sum + (mida >= 100 && mida <= 105 && kamut ? kamut : g / 50);
    }, 0);
    let proteinIn = 0, complete = true;
    for (const r of rows) {
      const ing = byCode.get(String(r.mitzbsisi));
      const p = n(ing?.protein), g = n(r.mishkal);
      if (p === null || g === null) {
        complete = false;
        break;
      }
      proteinIn += (g * p) / 100;
    }
    if (!complete || eggCount < 0.5) continue;
    const cookedWeight = (proteinIn / dishProtein) * 100;
    const perEgg = Math.round((cookedWeight / eggCount) * 10) / 10;
    if (perEgg < 30 || perEgg > 250) continue; // implausible → skip
    const list = units.get(dish) ?? [];
    list.unshift({ he: 'ביצה', en: 'egg', g: perEgg });
    units.set(dish, list);
    eggDishes++;
  }
  console.log(
    `Tzameret units: ${[...units.values()].reduce((a, l) => a + l.length, 0)} units for ${units.size} foods (${eggDishes} egg dishes with a per-egg unit)`,
  );
  return units;
}
