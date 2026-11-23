/**
 * Loads the bundled food database (src/data/food-database.json) into the local DB.
 * Offline and idempotent: new foods are inserted, existing ones get updated names/values.
 * Run: npm run db:foods
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { ExternalFood } from '../src/lib/food-sources';

try {
  process.loadEnvFile();
} catch {
  /* environment may be injected */
}
const db = new PrismaClient();

async function main() {
  const file = path.resolve('src/data/food-database.json');
  const foods = JSON.parse(await fs.readFile(file, 'utf8')) as ExternalFood[];
  const existing = await db.food.findMany({
    where: { source: { in: ['usda', 'openfoodfacts', 'tzameret'] }, externalId: { not: null } },
    select: { id: true, source: true, externalId: true, nameEn: true, nameHe: true, calories: true },
  });
  const byKey = new Map(existing.map((f) => [`${f.source}:${f.externalId}`, f]));
  const fresh = foods.filter((f) => !byKey.has(`${f.source}:${f.externalId}`));
  const changed = foods.filter((f) => {
    const e = byKey.get(`${f.source}:${f.externalId}`);
    return e && (e.nameEn !== f.nameEn || e.nameHe !== f.nameHe || e.calories !== f.calories);
  });
  for (let i = 0; i < fresh.length; i += 500)
    await db.food.createMany({
      data: fresh.slice(i, i + 500).map((f) => ({ ...f, ownerId: null })),
    });
  for (let i = 0; i < changed.length; i += 200)
    await db.$transaction(
      changed.slice(i, i + 200).map((f) =>
        db.food.update({
          where: { source_externalId: { source: f.source, externalId: f.externalId } },
          data: {
            nameEn: f.nameEn,
            nameHe: f.nameHe,
            brand: f.brand,
            calories: f.calories,
            protein: f.protein,
            carbs: f.carbs,
            fat: f.fat,
            fiber: f.fiber,
          },
        }),
      ),
    );
  // Household units: replace each dataset food's units with the bundled ones.
  const ids = new Map(
    (
      await db.food.findMany({
        where: { source: { in: ['usda', 'openfoodfacts', 'tzameret'] }, externalId: { not: null } },
        select: { id: true, source: true, externalId: true },
      })
    ).map((f) => [`${f.source}:${f.externalId}`, f.id]),
  );
  const unitRows = foods.flatMap((f) => {
    const foodId = ids.get(`${f.source}:${f.externalId}`);
    return foodId
      ? (f.units ?? []).map((u, position) => ({
          foodId,
          nameHe: u.he.slice(0, 80),
          nameEn: u.en.slice(0, 80),
          grams: u.g,
          position,
        }))
      : [];
  });
  await db.foodUnit.deleteMany({ where: { foodId: { in: [...ids.values()] } } });
  for (let i = 0; i < unitRows.length; i += 1000)
    await db.foodUnit.createMany({ data: unitRows.slice(i, i + 1000) });
  console.log(`food units: ${unitRows.length}`);

  // Logged meals and menu items keep the unit's name; follow relabelled units ("half" → "חצי").
  const relabel = new Map<string, string>();
  for (const u of unitRows) relabel.set(`${u.foodId}\u0000${u.nameEn}`, u.nameHe);
  let relabelled = 0;
  for (const table of [db.mealEntry, db.mealPlanItem] as const) {
    const rows = await (table as typeof db.mealEntry).findMany({
      where: { unitEn: { not: null } },
      select: { id: true, foodId: true, unitHe: true, unitEn: true },
    });
    for (const row of rows) {
      const nameHe = relabel.get(`${row.foodId}\u0000${row.unitEn}`);
      if (!nameHe || nameHe === row.unitHe) continue;
      await (table as typeof db.mealEntry).update({ where: { id: row.id }, data: { unitHe: nameHe } });
      relabelled++;
    }
  }
  if (relabelled) console.log(`relabelled ${relabelled} logged or planned amounts`);

  // Remove rows no longer in the dataset (e.g. merged duplicates) unless someone already uses them.
  const current = new Set(foods.map((f) => `${f.source}:${f.externalId}`));
  const stale = existing.filter((f) => !current.has(`${f.source}:${f.externalId}`)).map((f) => f.id);
  let removed = 0;
  for (let i = 0; i < stale.length; i += 500)
    removed += (
      await db.food.deleteMany({
        where: {
          id: { in: stale.slice(i, i + 500) },
          meals: { none: {} },
          ingredients: { none: {} },
          planItems: { none: {} },
        },
      })
    ).count;
  console.log(
    `food database: ${fresh.length} added, ${changed.length} updated, ${removed} removed` +
      ` (${stale.length - removed} kept because they are in use), ${foods.length} total`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
