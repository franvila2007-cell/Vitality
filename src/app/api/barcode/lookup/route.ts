import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Open Food Facts is a free, keyless, community-maintained nutrition
// database — exact values for a packaged product's *default* size, not an
// estimate, so entries logged this way are never marked `estimated`. All
// mass-based nutriments come back in grams per 100g regardless of the
// display unit (confirmed against the live API, e.g. sodium_100g is grams,
// not mg) — converted below to the mg/mcg units this app's schema uses.
const OFF_URL = (code: string) =>
  `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,quantity,nutriscore_grade,image_front_small_url,nutriments`;

// A-E on Nutri-Score maps reasonably onto the same 0-100 quality scale
// Vitto's LLM already estimates for chat-logged food — and for a packaged
// product it's a more authoritative signal than an AI guess from the name,
// so it's used here instead of calling the LLM.
const NUTRISCORE_QUALITY: Record<string, number> = { a: 92, b: 76, c: 56, d: 34, e: 14 };

function g100(nutriments: Record<string, unknown>, key: string): number | null {
  const v = nutriments[`${key}_100g`];
  return typeof v === 'number' ? v : null;
}

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('code');
  if (!code || !/^\d{6,14}$/.test(code)) return NextResponse.json({ error: 'a numeric barcode is required' }, { status: 400 });

  let res: Response;
  try {
    res = await fetch(OFF_URL(code), { headers: { 'User-Agent': 'Vitality-App/1.0 (coaching app; contact via app owner)' } });
  } catch (err) {
    console.error('Open Food Facts fetch failed', err);
    return NextResponse.json({ error: "Couldn't reach the food database — try again." }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ error: 'Lookup failed' }, { status: 502 });

  const data = await res.json();
  if (data.status !== 1 || !data.product) {
    return NextResponse.json({ error: "That barcode isn't in the database — you can still log it manually via chat." }, { status: 404 });
  }

  const p = data.product;
  const n: Record<string, unknown> = p.nutriments || {};
  const grams = (key: string) => g100(n, key);
  const mg = (key: string) => { const v = g100(n, key); return v == null ? null : Math.round(v * 1000 * 10) / 10; };
  const mcg = (key: string) => { const v = g100(n, key); return v == null ? null : Math.round(v * 1_000_000 * 10) / 10; };

  const per100g = {
    calories: g100(n, 'energy-kcal') ?? 0,
    protein_g: grams('proteins') ?? 0,
    carbs_g: grams('carbohydrates') ?? 0,
    fat_g: grams('fat') ?? 0,
    fiber_g: grams('fiber'),
    sugar_g: grams('sugars'),
    sodium_mg: mg('sodium'),
    calcium_mg: mg('calcium'),
    iron_mg: mg('iron'),
    potassium_mg: mg('potassium'),
    magnesium_mg: mg('magnesium'),
    zinc_mg: mg('zinc'),
    vitamin_a_mcg: mcg('vitamin-a'),
    vitamin_c_mg: mg('vitamin-c'),
    vitamin_d_mcg: mcg('vitamin-d'),
    vitamin_e_mg: mg('vitamin-e'),
    vitamin_k_mcg: mcg('vitamin-k'),
    vitamin_b6_mg: mg('vitamin-b6'),
    vitamin_b12_mcg: mcg('vitamin-b12'),
    folate_mcg: mcg('vitamin-b9'),
  };

  const qualityScore = p.nutriscore_grade ? NUTRISCORE_QUALITY[String(p.nutriscore_grade).toLowerCase()] ?? null : null;

  return NextResponse.json({
    name: p.product_name || 'Unknown product',
    brand: p.brands || null,
    quantity: p.quantity || null,
    imageUrl: p.image_front_small_url || null,
    qualityScore,
    per100g,
  });
}
