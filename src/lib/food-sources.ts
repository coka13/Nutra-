/**
 * Parsers for the bundled food database (built once by scripts/build-food-database.ts).
 * The running app never calls these sources; it searches the local database only.
 *
 * - USDA FoodData Central (public domain): Foundation + FNDDS (Survey) foods.
 * - Open Food Facts (ODbL): products sold in Israel.
 * - Tzameret, Israel Ministry of Health national food composition database (data.gov.il, open
 *   licence): Israeli generic foods and ~1,400 cooked dishes with native Hebrew names.
 *
 * All values are per 100 g. Records with missing or physically impossible values are dropped.
 */
export type FoodSource = 'openfoodfacts' | 'usda' | 'tzameret';
export type ExternalFood = {
  source: FoodSource;
  externalId: string;
  nameEn: string;
  nameHe: string;
  brand: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  /** Household units (e.g. כף = 30 g, ביצה = 61 g). Grams are always available. */
  units?: { he: string; en: string; g: number }[];
};

const round = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};

/** Rejects incomplete or physically impossible records (common in crowd-sourced data). */
export function plausible(f: Omit<ExternalFood, 'calories'> & { calories: number | null }) {
  const { calories, protein, carbs, fat, fiber } = f;
  if (calories === null || !f.nameEn.trim()) return null;
  if (calories > 950 || [protein, carbs, fat, fiber].some((v) => v > 100)) return null;
  if (protein + carbs + fat > 105) return null;
  const estimate = 4 * protein + 4 * carbs + 9 * fat;
  // Label energy and macros should roughly agree (fibre/alcohol/polyols explain small gaps).
  if (Math.abs(estimate - calories) > Math.max(60, calories * 0.35)) return null;
  return {
    ...f,
    nameEn: f.nameEn.replace(/\s+/g, ' ').trim().slice(0, 200),
    nameHe: f.nameHe.replace(/\s+/g, ' ').trim().slice(0, 200),
    brand: f.brand?.trim().slice(0, 120) || null,
    calories: Math.round(calories),
    protein: round(protein),
    carbs: round(carbs),
    fat: round(fat),
    fiber: round(fiber),
  } satisfies ExternalFood;
}

/* ---------- Open Food Facts ---------- */
export type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  product_name_he?: string;
  brands?: string | string[];
  nutriments?: Record<string, unknown>;
};

export function fromOff(p: OffProduct) {
  const n = p.nutriments || {};
  const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
  const calories = num(n['energy-kcal_100g']) ?? (kj !== null ? kj / 4.184 : null);
  const brand = Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0];
  const isHe = (s?: string) => !!s && /[֐-׿]/.test(s);
  const he = p.product_name_he || (isHe(p.product_name) ? p.product_name : '');
  const en = p.product_name_en || (!isHe(p.product_name) ? p.product_name : '') || '';
  if (!p.code || !(he || en)) return null;
  return plausible({
    source: 'openfoodfacts',
    externalId: p.code,
    nameEn: en || he || '',
    nameHe: he || '',
    brand: brand || null,
    calories,
    protein: num(n['proteins_100g']) ?? 0,
    carbs: num(n['carbohydrates_100g']) ?? 0,
    fat: num(n['fat_100g']) ?? 0,
    fiber: num(n['fiber_100g']) ?? 0,
  });
}

/* ---------- USDA FoodData Central (bulk JSON downloads) ---------- */
export type UsdaFood = {
  fdcId?: number;
  description?: string;
  foodNutrients?: { nutrient?: { number?: string }; amount?: number }[];
};

export function fromUsda(f: UsdaFood) {
  const byNumber = new Map<string, number>();
  for (const n of f.foodNutrients || []) {
    const key = n.nutrient?.number;
    const value = num(n.amount);
    if (key && value !== null && !byNumber.has(key)) byNumber.set(key, value);
  }
  const kcal = byNumber.get('208') ?? byNumber.get('957') ?? byNumber.get('958');
  const kj = byNumber.get('268');
  const name = (f.description || '').replace(/\s+/g, ' ');
  const pretty =
    name === name.toUpperCase() ? name.toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : name;
  if (!f.fdcId) return null;
  return plausible({
    source: 'usda',
    externalId: String(f.fdcId),
    nameEn: pretty,
    nameHe: '',
    brand: null,
    calories: kcal ?? (kj !== undefined ? kj / 4.184 : null),
    protein: byNumber.get('203') ?? 0,
    carbs: byNumber.get('205') ?? 0,
    fat: byNumber.get('204') ?? 0,
    fiber: byNumber.get('291') ?? 0,
  });
}

/* ---------- Tzameret (Israel Ministry of Health) ---------- */
export type TzameretRow = {
  Code?: number | string;
  shmmitzrach?: string;
  english_name?: string;
  food_energy?: number | string | null;
  protein?: number | string | null;
  total_fat?: number | string | null;
  carbohydrates?: number | string | null;
  total_dietary_fiber?: number | string | null;
};

/** Israeli manufacturers / chains that Tzameret appends after the last comma of a name. */
export const IL_BRANDS = [
  'אסם', 'תנובה', 'שטראוס', 'עלית', 'גד', 'תלמה', 'מקדונלדס', 'קנור', 'עוף טוב', 'מטרנה',
  "אנג'ל", 'אנגל', 'נסטלה', 'טרה', 'סנפרוסט', 'טבעול', 'מעדנות', 'מאמא עוף', 'פילסברי',
  'צוריאל', 'פלדמן', 'מיקי', 'צבר', 'TUSSO', 'פריגת', 'טיבון ויל', 'שמיר', 'B&D', 'יטבתה',
  'אלפרו', 'מגאפארם', 'יחיעם', 'טירת צבי', 'יונה', 'כרמית', 'ספרינג', 'אבוט', 'דוידוביץ',
  'איזיליין', 'זוגלובק', 'פריניב', 'שומרון', 'הגביע', 'תופינית', 'פיראוס', 'המחלבה', 'מולר',
  'עוף העמק', 'חברת ירושלים לשומשום', 'אביב', 'ורד הגליל', 'הדסה', "בן & ג'ריס", 'פרמהבסט',
  'כפיר', 'מעדני מזרע', 'השחר העולה', 'אופנהיימר', 'שופרסל', 'תפוגן', 'שלושת האופים', 'גת',
  'פיצוחית', 'ברמן', 'וילי פוד', 'ויליפוד', 'שמרלינג', 'מגנום', "ג'ויה", 'סוגת', 'פרי ניב',
  'יכין', 'מילוטל', 'בייגל בייגל', 'קוקה קולה', 'פפסי', 'פרימור', 'יופלה', 'דנונה', 'נטו',
  'מאסטר שף', 'שקדיה', 'ברקן', 'בורגר קינג', 'פיצה האט', 'דומינוס', 'ארומה', 'קפה קפה',
  'לנדוור', 'רמי לוי', 'אחלה', 'הוד חפר', 'זוגלובק', 'מבשלת', 'כרמל', 'ביסלי',
];
const brandKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}&]+/gu, '');

/** Splits "food, Brand" (or "food, BrandA/BrandB") into name and brand when the tail is a brand. */
export function splitTrailingBrand(name: string, brands: Set<string>) {
  const i = name.lastIndexOf(',');
  if (i < 0) return { name, brand: null as string | null };
  const tail = name.slice(i + 1).trim();
  const parts = tail.split(/[/,]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length && parts.every((p) => brands.has(brandKey(p))))
    return { name: name.slice(0, i).trim(), brand: tail };
  return { name, brand: null };
}
export function brandSet(extra: (string | null | undefined)[] = []) {
  return new Set(
    [...IL_BRANDS, ...extra]
      .filter((b): b is string => !!b && b.trim().length > 1)
      .map(brandKey)
      .filter(Boolean),
  );
}

export function fromTzameret(r: TzameretRow, brands: Set<string> = brandSet()) {
  // "FFQ-" marks questionnaire food groups; the name after it is still meaningful.
  const clean = (v?: string) => (v || '').replace(/^\s*FFQ\s*-\s*/i, '').replace(/\s+/g, ' ').trim();
  const split = splitTrailingBrand(clean(r.shmmitzrach), brands);
  const nameHe = split.name;
  let nameEn = clean(r.english_name) || nameHe;
  // The English name carries the brand in the same position ("…, Elite"); drop it too.
  if (split.brand) {
    const j = nameEn.lastIndexOf(',');
    if (j > 0 && /^[A-Z0-9&'\s/.-]+$/i.test(nameEn.slice(j + 1).trim()) && nameEn.slice(j + 1).trim().split(/\s+/).length <= 4)
      nameEn = nameEn.slice(0, j).trim();
  }
  if (r.Code === undefined || r.Code === null || !nameHe) return null;
  return plausible({
    source: 'tzameret',
    externalId: String(r.Code),
    nameEn,
    nameHe,
    brand: split.brand,
    calories: num(r.food_energy),
    protein: num(r.protein) ?? 0,
    carbs: num(r.carbohydrates) ?? 0,
    fat: num(r.total_fat) ?? 0,
    fiber: num(r.total_dietary_fiber) ?? 0,
  });
}
