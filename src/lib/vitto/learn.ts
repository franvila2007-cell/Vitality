// Vitto learns a product the first time someone mentions it: when the local
// engine doesn't know a food, look it up on Open Food Facts, keep the real
// label values in foods_global (flagged `learned`, so the coach can review,
// fix or delete them on /coach/foods) and use them straight away. Every
// client benefits from every client's first mention.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getIndex, normalizeText, parseModifiers, type VittoFoods } from './foodParser';
import type { FoodEntry } from './foodDb';
import { offToEntry, pickBest, queryTokens, searchOff, type OffProduct } from './offSearch';

const knownWords = new WeakMap<VittoFoods, Set<string>>();
function wordsKnown(foods: VittoFoods): Set<string> {
  let set = knownWords.get(foods);
  if (!set) {
    set = new Set<string>();
    for (const e of getIndex(foods)) for (const w of e.variant.split(' ')) set.add(w);
    knownWords.set(foods, set);
  }
  return set;
}

// Searches that found nothing recently — don't ask Open Food Facts again for
// the same junk on every message (best-effort, per server instance).
const MISSES = new Map<string, number>();
const MISS_TTL_MS = 10 * 60 * 1000;

export type LearnedFood = { key: string; product: OffProduct; entry: FoodEntry };

/** Key under which a learned product is stored: the words the client used, in order. */
function keyFor(text: string): string {
  const words = parseModifiers(normalizeText(text)).leftover.map((w) => w.replace(/[^a-z0-9]/g, '')).filter((w) => w.length >= 2);
  return words.join(' ').slice(0, 60);
}

async function learnOne(text: string, foods: VittoFoods): Promise<LearnedFood | null> {
  const key = keyFor(text);
  if (!key || key.length < 4 || foods.db[key]) return null;
  const tokens = queryTokens(key);
  if (tokens.length === 0 || tokens.length > 5) return null;
  // Only chase words Vitto genuinely doesn't know — never re-define "chicken".
  const known = wordsKnown(foods);
  if (!tokens.some((t) => !known.has(t))) return null;
  const missedAt = MISSES.get(key);
  if (missedAt && Date.now() - missedAt < MISS_TTL_MS) return null;

  const product = pickBest(key, await searchOff(key, { timeoutMs: 2800 }));
  if (!product) { MISSES.set(key, Date.now()); return null; }
  return { key, product, entry: offToEntry(product) };
}

/**
 * Learns whatever it can from the unrecognised parts of a message. Returns the
 * extended food set (a NEW object — the parser caches its index per object)
 * plus what was learned.
 */
export async function learnUnknownFoods(texts: string[], foods: VittoFoods, admin: SupabaseClient): Promise<{ foods: VittoFoods; learned: LearnedFood[] }> {
  const results = (await Promise.all([...new Set(texts)].slice(0, 3).map((t) => learnOne(t, foods).catch(() => null)))).filter((x): x is LearnedFood => x !== null);
  if (results.length === 0) return { foods, learned: [] };

  const db = { ...foods.db };
  const synonyms = { ...foods.synonyms };
  for (const l of results) {
    const stored = { ...l.entry, approx: true, learned: true, source: 'openfoodfacts', off_code: l.product.code, off_name: [l.product.brand, l.product.name].filter(Boolean).join(' ') };
    db[l.key] = stored as FoodEntry;
    const alias = [l.product.brand, l.product.name].filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (alias && alias !== l.key && !db[alias] && !synonyms[alias] && alias.length <= 60) synonyms[alias] = l.key;
    // Persist (best-effort): never overwrite something that already exists.
    const { type, ...data } = stored as { type: string };
    const { error } = await admin.from('foods_global').upsert({ name: l.key, type, data }, { onConflict: 'name', ignoreDuplicates: true });
    if (!error && synonyms[alias] === l.key) await admin.from('food_synonyms').upsert({ phrase: alias, canonical: l.key }, { onConflict: 'phrase', ignoreDuplicates: true });
    if (error) console.error('learn: could not save', l.key, error.message);
  }
  return { foods: { db, synonyms }, learned: results };
}
