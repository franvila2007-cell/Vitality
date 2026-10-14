// Open Food Facts text search — how Vitto learns packaged and branded foods
// (including Maltese products, which the community database covers well) from
// real label values instead of guessing. Used two ways: the coach's "Teach
// Vitto" page searches it to prefill a food, and Vitto's chat falls back on it
// when a client mentions a product he has never heard of.
//
// Server-side only (calls a third-party API with a timeout and a User-Agent).
import type { FoodEntry } from './foodDb';

export type OffProduct = {
  code: string;
  name: string;
  brand: string | null;
  per100: { cal: number; prot: number; carb: number; fat: number };
  /** grams (or ml) in one serving / pack, when the label says */
  servingG: number | null;
  packG: number | null;
  liquid: boolean;
  /** crisps / biscuits / chocolate / sweets — eaten by the handful or bar, not by the 100g */
  snack: boolean;
  /** protein powder — scooped, ~30g */
  powder: boolean;
  malta: boolean;
  countries: string[];
};

const FIELDS = 'code,product_name,brands,nutriments,serving_quantity,serving_size,quantity,countries_tags,categories_tags';
const UA = 'Vitality-App/1.0 (coaching app; contact via app owner)';

type RawHit = {
  code?: string; product_name?: string; brands?: string[] | string; quantity?: string; serving_quantity?: number | string; serving_size?: string;
  countries_tags?: string[]; categories_tags?: string[]; nutriments?: Record<string, unknown>;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function gramsFrom(text: string | undefined | null): { value: number; liquid: boolean } | null {
  if (!text) return null;
  const m = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/i.exec(text.replace(',', '.'));
  if (!m) return null;
  const v = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit === 'kg' || unit === 'l' ? 1000 : unit === 'cl' ? 10 : 1;
  return { value: v * mult, liquid: unit === 'ml' || unit === 'cl' || unit === 'l' };
}

function normalise(hit: RawHit): OffProduct | null {
  const n = hit.nutriments || {};
  let cal = num(n['energy-kcal_100g']);
  if (cal == null) { const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']); if (kj != null) cal = kj / 4.184; }
  const prot = num(n['proteins_100g']), carb = num(n['carbohydrates_100g']), fat = num(n['fat_100g']);
  const name = (hit.product_name || '').trim();
  if (!name || cal == null || prot == null || carb == null || fat == null) return null;
  // Reject label data that contradicts itself (typos in the community database).
  const implied = 4 * prot + 4 * carb + 9 * fat;
  if (cal > 900 || Math.abs(cal - implied) > 0.35 * Math.max(cal, 50) + 25) return null;
  // 0 kcal is only believable for water-like drinks; otherwise it's an empty record.
  if (cal === 0 && !/zero|water|diet|light|sugar.?free|0%|tonic|soda/i.test(`${hit.product_name} ${(hit.categories_tags || []).join(' ')}`)) return null;
  const brand = Array.isArray(hit.brands) ? hit.brands.join(', ') : hit.brands || null;
  const serving = num(typeof hit.serving_quantity === 'string' ? parseFloat(hit.serving_quantity) : hit.serving_quantity) ?? gramsFrom(hit.serving_size)?.value ?? null;
  const pack = gramsFrom(hit.quantity);
  const cats = hit.categories_tags || [];
  return {
    code: hit.code || '',
    name,
    brand: brand && brand.trim() ? brand.trim() : null,
    per100: { cal: Math.round(cal), prot: Math.round(prot * 10) / 10, carb: Math.round(carb * 10) / 10, fat: Math.round(fat * 10) / 10 },
    servingG: serving && serving > 0 ? serving : null,
    packG: pack?.value ?? null,
    liquid: !!pack?.liquid || cats.some((c) => /beverage|drink|soda|juice|water|beer|wine/.test(c)),
    snack: cats.some((c) => /snack|chips|crisps|biscuit|cookie|chocolate|confection|sweet|candy|wafer/.test(c)) || /chips|crisps|crackers|biscuit|cookie|chocolate|wafer|snack|popcorn|nuts/i.test(name),
    powder: /whey|protein powder|isolate|casein|mass gainer/i.test(name),
    malta: (hit.countries_tags || []).includes('en:malta'),
    countries: hit.countries_tags || [],
  };
}

export async function searchOff(query: string, opts: { timeoutMs?: number; limit?: number } = {}): Promise<OffProduct[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=${opts.limit ?? 15}&fields=${FIELDS}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(opts.timeoutMs ?? 3000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { hits?: RawHit[] };
    return (data.hits || []).map(normalise).filter((p): p is OffProduct => p !== null);
  } catch {
    return [];
  }
}

const FILLER = new Set(['the', 'and', 'with', 'from', 'some', 'my', 'a', 'an', 'of', 'for', 'bar', 'pack', 'packet', 'bag', 'tin', 'can', 'bottle', 'box', 'pot']);
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function queryTokens(query: string): string[] {
  return fold(query).split(' ').filter((t) => t.length >= 3 && !FILLER.has(t));
}

/**
 * The product that really is what was asked for, or null. Strict on purpose:
 * every meaningful word of the query must appear in the brand + product name,
 * so "twistees" never turns into some other snack. Malta-sold products win ties
 * (a Maltese client's "twistees" is the Maltese one), then the closest name.
 */
export function pickBest(query: string, products: OffProduct[]): OffProduct | null {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return null;
  const scored = products
    .map((p) => {
      const hay = fold(`${p.brand ?? ''} ${p.name}`);
      const words = hay.split(' ');
      const matched = tokens.every((t) => words.some((w) => w === t || w.startsWith(t) || (t.length >= 5 && w.includes(t))));
      const extra = Math.max(0, words.length - tokens.length); // fewer unrelated words = closer match
      return { p, matched, score: (p.malta ? 0 : 10) + extra + (p.servingG || p.packG ? 0 : 1) };
    })
    .filter((x) => x.matched)
    .sort((a, b) => a.score - b.score);
  return scored[0]?.p ?? null;
}

/** A per-100g (or per-100ml) FoodEntry from label data, with a sensible default serving. */
export function offToEntry(p: OffProduct): FoodEntry {
  // Serving: what the label says, else a believable single portion by kind of
  // product (a bag of crisps is ~35g, a scoop of whey 30g, a can 330ml) — never
  // "100g of crisps".
  let serving = p.servingG ?? (p.packG && p.packG <= 60 ? p.packG : null);
  if (!serving) serving = p.powder ? 30 : p.snack ? 35 : p.liquid ? 330 : p.packG && p.packG <= 150 ? p.packG : 100;
  const extra: Record<string, unknown> = {};
  if (p.liquid) { extra.liquid = true; extra.canGrams = p.packG && p.packG <= 750 ? p.packG : 330; extra.glassGrams = 250; }
  else if (p.powder) extra.scoopGrams = 30;
  else if (p.servingG) extra.pieceGrams = p.servingG;
  if (p.packG && p.packG <= 400 && !p.liquid) extra.packGrams = p.packG;
  return { type: 'per100g', ...p.per100, defaultGrams: Math.round(serving), ...extra } as FoodEntry;
}
