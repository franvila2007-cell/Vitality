// Single place that assembles the food database Vitto matches against, so
// the API route and the regression harness can never drift apart.
//
// Layering (later wins): built-in extras  <  coach's foods_global  <  this
// client's saved recipes/foods. Coach-curated numbers are never overridden.
import type { FoodEntry } from './foodDb';
import type { VittoFoods } from './foodParser';
import { EXTRA_FOODS, EXTRA_SYNONYMS } from './foodDbExtra';

type GlobalRow = { name: string; type: string; data: unknown };
type SynonymRow = { phrase: string; canonical: string };
type CustomRow = { name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; default_grams: number | null };

export function buildVittoFoods(globalRows: GlobalRow[], synonymRows: SynonymRow[], customRows: CustomRow[]): VittoFoods {
  const db: Record<string, FoodEntry> = { ...EXTRA_FOODS };
  for (const row of globalRows) db[row.name] = { type: row.type, ...(row.data as object) } as FoodEntry;

  const synonyms: Record<string, string> = { ...EXTRA_SYNONYMS };
  for (const s of synonymRows) synonyms[s.phrase] = s.canonical;

  // The coach's seed calls potato crisps "chips" (US usage). Clients here
  // write British English where "chips" are fries — move the coach's crisps
  // numbers to "crisps" and let bare "chips" mean fries ("bag of chips" is
  // rewritten to crisps in normalizeText).
  if (db['chips']) {
    db['crisps'] = db['chips'];
    delete db['chips'];
  }
  for (const [phrase, canonical] of Object.entries(synonyms)) if (canonical === 'chips') synonyms[phrase] = 'crisps';
  synonyms['chips'] = 'fries';
  synonyms['toastie'] = 'cheese toastie';

  for (const cf of customRows) {
    // perUnit, not per100g: a client-saved recipe/food's stored macros are for
    // ONE serving/piece as they described it ("Almond" = one almond, "Yuho
    // burger" = one burger) — treating that as "per 100g" silently divides
    // real portions down to near-zero.
    db[cf.name] = { type: 'perUnit', cal: cf.calories, prot: cf.protein_g, carb: cf.carbs_g, fat: cf.fat_g, label: cf.name, avgGrams: cf.default_grams ?? 100 };
  }
  return { db, synonyms };
}
