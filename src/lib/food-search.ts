import type { Food, FoodUnit, PrismaClient } from '@prisma/client';
import { foodNameKey } from './food-dedupe';

/** Normalises text for matching: lower-case, no niqqud, unified quotes/geresh, single spaces. */
export function normalizeFoodText(s: string) {
  return s
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '') // Hebrew niqqud / cantillation
    .replace(/[׳'`’]/g, "'")
    .replace(/[״"“”]/g, '"')
    .replace(/[^\p{L}\p{N}%'".\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lower is better: exact → starts with → a word starts with → contains. */
function matchRank(name: string, q: string, terms: string[]) {
  const n = normalizeFoodText(name);
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  const words = n.split(/[\s,()-]+/);
  if (terms.every((t) => words.some((w) => w.startsWith(t)))) return 2;
  if (n.includes(q)) return 3;
  return 4;
}

const SOURCE_ORDER: Record<string, number> = {
  'user-estimate': 0,
  'original-estimate': 1,
  tzameret: 2,
  usda: 3,
  openfoodfacts: 4,
};

/**
 * Searches the local food database only (bundled datasets + the user's own foods).
 * Every word must appear in the English name, Hebrew name or brand.
 */
export async function searchLocalFoods(
  db: PrismaClient,
  userId: string,
  query: string,
  lang: 'en' | 'he',
  limit = 40,
): Promise<(Food & { units: FoodUnit[] })[]> {
  const q = normalizeFoodText(query);
  const terms = q.split(' ').filter(Boolean).slice(0, 6);
  if (!terms.length) return [];
  const candidates = await db.food.findMany({
    where: {
      AND: [
        {
          OR: [
            {
              ownerId: null,
              source: { notIn: ['private-retained', 'user-estimate', 'ai-photo-estimate'] },
            },
            { ownerId: userId },
          ],
        },
        ...terms.map((t) => ({
          OR: [
            { nameEn: { contains: t } },
            { nameHe: { contains: t } },
            { brand: { contains: t } },
          ],
        })),
      ],
    },
    include: { units: { orderBy: { position: 'asc' } } },
    take: 400,
  });
  const seen = new Set<string>();
  return (
    candidates
      .map((food) => {
        const primary = lang === 'he' ? food.nameHe : food.nameEn;
        const secondary = lang === 'he' ? food.nameEn : food.nameHe;
        const rank = Math.min(matchRank(primary, q, terms), matchRank(secondary, q, terms) + 0.5);
        return {
          food,
          rank,
          length: primary.length,
          source: SOURCE_ORDER[food.source] ?? 5,
          branded: food.brand ? 1 : 0,
        };
      })
      // Generic foods (no brand) first: a branded exact match ranks below a generic prefix match.
      .sort(
        (a, b) =>
          a.rank + a.branded * 1.5 - (b.rank + b.branded * 1.5) ||
          a.source - b.source ||
          a.length - b.length,
      )
      .filter((r) => {
        // Never show two foods with the same visible name.
        const key = foodNameKey(lang === 'he' ? r.food.nameHe : r.food.nameEn);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit)
      .map((r) => r.food)
  );
}
