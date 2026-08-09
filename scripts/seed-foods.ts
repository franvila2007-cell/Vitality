// Populates foods_global / food_synonyms from the ported FOOD_DB / FOOD_SYNONYMS.
// Run with: npx tsx scripts/seed-foods.ts
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment
// (service role is required since foods_global writes are coach-only via RLS,
// and this script runs outside any user session).

import { createClient } from '@supabase/supabase-js';
import { FOOD_DB, FOOD_SYNONYMS } from '../src/lib/vitto/foodDb';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function main() {
  const foodRows = Object.entries(FOOD_DB).map(([name, entry]) => {
    const { type, ...data } = entry as Record<string, unknown>;
    return { name, type, data };
  });

  const { error: foodsErr } = await supabase.from('foods_global').upsert(foodRows, { onConflict: 'name' });
  if (foodsErr) throw foodsErr;
  console.log(`Seeded ${foodRows.length} foods_global rows.`);

  const synonymRows = Object.entries(FOOD_SYNONYMS)
    .filter(([phrase, canonical]) => phrase !== canonical) // skip no-op entries like donut:donut
    .map(([phrase, canonical]) => ({ phrase, canonical }));

  const { error: synErr } = await supabase.from('food_synonyms').upsert(synonymRows, { onConflict: 'phrase' });
  if (synErr) throw synErr;
  console.log(`Seeded ${synonymRows.length} food_synonyms rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
