/**
 * Re-labels the Hebrew names of USDA household units in src/data/food-database.json
 * with the curated translations (no network). Then run `npm run db:foods` to load them.
 * Run: npx tsx scripts/fix-food-unit-names.ts
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ExternalFood } from '../src/lib/food-sources';
import { pickHebrewUnit } from './food-unit-names';

async function main() {
  const file = path.resolve('src/data/food-database.json');
  const foods = JSON.parse(await fs.readFile(file, 'utf8')) as ExternalFood[];
  let changed = 0;
  for (const f of foods) {
    if (f.source !== 'usda') continue;
    for (const u of f.units ?? []) {
      const he = pickHebrewUnit(u.en, u.he !== u.en ? u.he : null).slice(0, 80);
      if (he !== u.he) {
        u.he = he;
        changed++;
      }
    }
  }
  await fs.writeFile(file, JSON.stringify(foods) + '\n');
  console.log(`updated ${changed} unit labels`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
