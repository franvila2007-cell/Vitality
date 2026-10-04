// "Vitto Recommends": picks a realistic NEXT meal from what's left of the
// day's targets. Deliberately not an optimiser that tries to land every macro
// exactly — it chooses from a curated set of ordinary meals (the kind people
// actually cook), sizes the portions to a sensible share of what's left, and
// ranks by how well the result moves the client toward their gaps without
// blowing past any target.
//
// Nutrition numbers come from the same food database Vitto logs with
// (buildVittoFoods: built-ins < coach's foods_global), so a recommended meal
// logs to the same numbers the card showed.
import type { FoodEntry } from './foodDb';

export type Macros = { cal: number; prot: number; carb: number; fat: number };

type Ing = {
  food: string;            // key in the food database
  amt: number;             // grams ('g') or a piece count ('n')
  unit: 'g' | 'n';
  name: string;            // shown to the client
  plural?: string;         // for counts: "eggs"
  scale?: boolean;         // resized with the portion (mains/carbs); sauces/oil stay fixed
  min?: number;            // smallest sensible count when scaled down
};

type Template = {
  id: string;
  name: string;
  kind: 'breakfast' | 'main' | 'snack';
  group: string;           // dishes sharing a group aren't offered side by side
  items: Ing[];
};

const g = (food: string, amt: number, name: string, scale = true): Ing => ({ food, amt, unit: 'g', name, scale });
const n = (food: string, amt: number, name: string, plural?: string, scale = true, min = 1): Ing => ({ food, amt, unit: 'n', name, plural, scale, min });

export const TEMPLATES: Template[] = [
  // ── mains ──────────────────────────────────────────────────────────────
  { id: 'steak-eggs-potatoes', name: 'Steak, Eggs & Potatoes', kind: 'main', group: 'steak', items: [
    g('sirloin steak', 180, 'lean steak'), n('egg', 2, 'egg', 'eggs'), g('potato', 300, 'potatoes'), g('olive oil', 5, 'olive oil for cooking', false) ] },
  { id: 'chicken-rice-broccoli', name: 'Chicken, Rice & Broccoli', kind: 'main', group: 'chicken-rice', items: [
    g('chicken breast', 180, 'chicken breast'), g('rice', 200, 'cooked rice'), g('broccoli', 100, 'broccoli', false), g('olive oil', 5, 'olive oil for cooking', false) ] },
  { id: 'chicken-sweet-potato', name: 'Chicken & Sweet Potato Bowl', kind: 'main', group: 'chicken-potato', items: [
    g('chicken breast', 170, 'chicken breast'), g('sweet potato', 250, 'sweet potato'), g('spinach', 60, 'spinach', false), g('olive oil', 5, 'olive oil', false) ] },
  { id: 'salmon-rice-greens', name: 'Salmon, Rice & Greens', kind: 'main', group: 'salmon', items: [
    g('salmon', 150, 'salmon fillet'), g('rice', 180, 'cooked rice'), g('green beans', 100, 'green beans', false) ] },
  { id: 'salmon-potatoes', name: 'Salmon, Roast Potatoes & Asparagus', kind: 'main', group: 'salmon', items: [
    g('salmon', 150, 'salmon fillet'), g('roast potatoes', 200, 'roast potatoes'), g('asparagus', 100, 'asparagus', false) ] },
  { id: 'turkey-pasta', name: 'Turkey Mince Pasta', kind: 'main', group: 'pasta', items: [
    g('turkey mince', 150, 'turkey mince'), g('pasta', 200, 'cooked pasta'), g('tomato sauce', 100, 'tomato sauce', false), g('parmesan', 10, 'parmesan', false) ] },
  { id: 'beef-chilli-rice', name: 'Beef Chilli & Rice', kind: 'main', group: 'beef', items: [
    g('beef mince', 130, 'lean beef mince'), g('rice', 200, 'cooked rice'), g('kidney beans', 100, 'kidney beans', false), g('tomato sauce', 100, 'chopped tomato sauce', false) ] },
  { id: 'tuna-pasta', name: 'Tuna Pasta', kind: 'main', group: 'pasta', items: [
    g('canned tuna', 120, 'tuna'), g('pasta', 200, 'cooked pasta'), g('tomato sauce', 100, 'tomato sauce', false), g('olive oil', 5, 'olive oil', false) ] },
  { id: 'prawn-noodle-stir-fry', name: 'Prawn & Noodle Stir-Fry', kind: 'main', group: 'stirfry', items: [
    g('shrimp', 150, 'prawns'), g('rice noodles', 180, 'cooked rice noodles'), g('mixed vegetables', 150, 'stir-fry veg', false), g('soy sauce', 15, 'soy sauce', false), g('olive oil', 5, 'oil for the pan', false) ] },
  { id: 'chicken-wrap', name: 'Chicken Salad Wrap', kind: 'main', group: 'wrap', items: [
    n('tortilla', 2, 'tortilla wrap', 'tortilla wraps'), g('chicken breast', 130, 'chicken breast'), g('mixed salad', 60, 'salad', false), g('tzatziki', 30, 'tzatziki', false) ] },
  { id: 'greek-chicken-pitta', name: 'Greek Chicken Pitta', kind: 'main', group: 'wrap', items: [
    n('pitta', 1, 'pitta', 'pittas'), g('chicken breast', 120, 'chicken breast'), g('tzatziki', 40, 'tzatziki', false), g('mixed salad', 60, 'salad', false) ] },
  { id: 'pork-potato-veg', name: 'Pork Tenderloin, Potatoes & Broccoli', kind: 'main', group: 'pork', items: [
    g('pork tenderloin', 180, 'pork tenderloin'), g('potato', 250, 'potatoes'), g('broccoli', 100, 'broccoli', false), g('butter', 8, 'butter', false) ] },
  { id: 'cod-potatoes-peas', name: 'White Fish, Potatoes & Peas', kind: 'main', group: 'whitefish', items: [
    g('cod', 180, 'cod'), g('potato', 250, 'potatoes'), g('peas', 100, 'peas', false), g('butter', 8, 'butter', false) ] },
  { id: 'chicken-pesto-pasta', name: 'Chicken Pesto Pasta', kind: 'main', group: 'pasta', items: [
    g('pasta', 200, 'cooked pasta'), g('chicken breast', 120, 'chicken breast'), g('pesto', 20, 'pesto', false), g('parmesan', 10, 'parmesan', false) ] },
  { id: 'burrito-bowl', name: 'Chicken & Bean Burrito Bowl', kind: 'main', group: 'chicken-rice', items: [
    g('chicken breast', 120, 'chicken breast'), g('rice', 180, 'cooked rice'), g('black beans', 120, 'black beans'), g('salsa', 50, 'salsa', false), n('avocado', 0.5, 'avocado', undefined, false) ] },
  { id: 'chicken-avocado-salad', name: 'Chicken & Avocado Salad', kind: 'main', group: 'salad', items: [
    g('chicken breast', 160, 'chicken breast'), n('avocado', 0.5, 'avocado', undefined, false), g('mixed salad', 80, 'mixed salad', false), g('olive oil', 8, 'olive oil dressing', false) ] },
  { id: 'veg-omelette', name: 'Cheesy Veg Omelette', kind: 'main', group: 'eggs', items: [
    n('egg', 3, 'egg', 'eggs'), g('cheese', 30, 'cheese', false), g('spinach', 50, 'spinach', false), g('mushrooms', 60, 'mushrooms', false), g('olive oil', 5, 'olive oil for cooking', false) ] },
  { id: 'halloumi-chickpea', name: 'Halloumi & Chickpea Bowl', kind: 'main', group: 'veggie', items: [
    g('halloumi', 80, 'halloumi'), g('chickpeas', 150, 'chickpeas'), g('mixed salad', 80, 'salad', false), g('olive oil', 5, 'olive oil', false) ] },
  { id: 'tofu-rice-stir-fry', name: 'Tofu & Rice Stir-Fry', kind: 'main', group: 'stirfry', items: [
    g('tofu', 150, 'firm tofu'), g('rice', 180, 'cooked rice'), g('mixed vegetables', 150, 'stir-fry veg', false), g('soy sauce', 15, 'soy sauce', false), g('olive oil', 5, 'oil for the pan', false) ] },
  { id: 'lentil-feta', name: 'Lentil & Feta Bowl', kind: 'main', group: 'veggie', items: [
    g('lentils', 200, 'cooked lentils'), g('feta', 40, 'feta', false), g('spinach', 60, 'spinach', false), g('olive oil', 8, 'olive oil', false) ] },
  { id: 'salmon-quinoa', name: 'Salmon & Quinoa Bowl', kind: 'main', group: 'salmon', items: [
    g('salmon', 140, 'salmon fillet'), g('quinoa', 180, 'cooked quinoa'), g('broccoli', 100, 'broccoli', false) ] },
  { id: 'smoked-salmon-bagel', name: 'Smoked Salmon & Cream Cheese Bagel', kind: 'main', group: 'bagel', items: [
    n('bagel', 1, 'bagel', 'bagels'), g('smoked salmon', 70, 'smoked salmon'), g('cream cheese', 25, 'cream cheese', false) ] },

  // fat-forward options, for days when the gap is mostly (good) fats
  { id: 'salmon-avocado', name: 'Salmon & Avocado Plate', kind: 'main', group: 'salmon', items: [
    g('salmon', 180, 'salmon fillet'), n('avocado', 1, 'avocado', 'avocados', false), g('asparagus', 100, 'asparagus', false), g('olive oil', 8, 'olive oil', false) ] },
  { id: 'ribeye-asparagus', name: 'Ribeye, Roast Potatoes & Asparagus', kind: 'main', group: 'steak', items: [
    g('ribeye', 180, 'ribeye steak'), g('roast potatoes', 150, 'roast potatoes'), g('asparagus', 100, 'asparagus', false), g('butter', 10, 'butter', false) ] },
  { id: 'lamb-feta-salad', name: 'Lamb Chops & Greek Feta Salad', kind: 'main', group: 'lamb', items: [
    g('lamb chop', 180, 'lamb chops'), g('feta', 40, 'feta', false), g('mixed salad', 100, 'salad', false), g('olive oil', 10, 'olive oil', false) ] },

  // carb-forward options, for days when the gap is mostly carbs
  { id: 'jacket-potato-beans', name: 'Jacket Potato, Beans & Cheese', kind: 'main', group: 'potato', items: [
    g('potato', 350, 'baked potato'), g('baked beans', 200, 'baked beans'), g('cheese', 20, 'grated cheese', false) ] },
  { id: 'pasta-arrabbiata', name: 'Pasta with Tomato Sauce', kind: 'main', group: 'pasta', items: [
    g('pasta', 300, 'cooked pasta'), g('tomato sauce', 150, 'tomato sauce', false), g('parmesan', 10, 'parmesan', false), g('olive oil', 5, 'olive oil', false) ] },
  { id: 'rice-beans-bowl', name: 'Rice & Black Bean Bowl', kind: 'main', group: 'rice-beans', items: [
    g('rice', 250, 'cooked rice'), g('black beans', 150, 'black beans'), g('salsa', 50, 'salsa', false) ] },

  // ── breakfasts ─────────────────────────────────────────────────────────
  { id: 'protein-porridge', name: 'Protein Porridge', kind: 'breakfast', group: 'oats', items: [
    g('oats', 60, 'rolled oats'), g('skimmed milk', 200, 'skimmed milk'), g('protein powder', 30, 'protein powder'), n('banana', 1, 'banana', 'bananas', false) ] },
  { id: 'yogurt-berries-granola', name: 'Greek Yogurt, Berries & Granola', kind: 'breakfast', group: 'yogurt', items: [
    g('greek yogurt', 250, 'Greek yogurt'), g('blueberries', 100, 'blueberries', false), g('granola', 40, 'granola') ] },
  { id: 'banana-oat-bowl', name: 'Banana Oat Bowl', kind: 'breakfast', group: 'oats', items: [
    g('oats', 80, 'rolled oats'), g('skimmed milk', 250, 'skimmed milk'), n('banana', 2, 'banana', 'bananas', false), g('honey', 10, 'honey', false) ] },
  { id: 'eggs-on-toast', name: 'Scrambled Eggs on Toast', kind: 'breakfast', group: 'eggs', items: [
    n('egg', 3, 'egg', 'eggs'), g('sourdough', 70, 'sourdough toast'), g('butter', 5, 'butter', false) ] },
  { id: 'avocado-egg-toast', name: 'Avocado & Egg Toast', kind: 'breakfast', group: 'eggs', items: [
    g('sourdough', 70, 'sourdough toast'), n('egg', 2, 'egg', 'eggs'), n('avocado', 0.5, 'avocado', undefined, false) ] },
  { id: 'bacon-egg-toast', name: 'Bacon & Egg Toast', kind: 'breakfast', group: 'eggs', items: [
    g('bread', 60, 'toast'), n('egg', 2, 'egg', 'eggs'), g('bacon', 40, 'bacon', false) ] },
  { id: 'pb-banana-toast', name: 'Peanut Butter Banana Toast', kind: 'breakfast', group: 'toast', items: [
    g('bread', 60, 'toast'), g('peanut butter', 20, 'peanut butter', false), n('banana', 1, 'banana', 'bananas', false) ] },

  // ── snacks ─────────────────────────────────────────────────────────────
  { id: 'yogurt-berries', name: 'Greek Yogurt & Berries', kind: 'snack', group: 'yogurt', items: [
    g('greek yogurt', 200, 'Greek yogurt'), g('blueberries', 80, 'blueberries', false), g('honey', 5, 'honey', false) ] },
  { id: 'cottage-ricecakes', name: 'Cottage Cheese on Rice Cakes', kind: 'snack', group: 'cottage', items: [
    g('cottage cheese', 150, 'cottage cheese'), n('rice cake', 3, 'rice cake', 'rice cakes'), n('tomato', 1, 'tomato', 'tomatoes', false) ] },
  { id: 'shake-banana', name: 'Protein Shake & Banana', kind: 'snack', group: 'shake', items: [
    n('protein shake', 1, 'scoop protein shake', 'scoops protein shake', false), n('banana', 1, 'banana', 'bananas', false) ] },
  { id: 'apple-pb', name: 'Apple & Peanut Butter', kind: 'snack', group: 'pb', items: [
    n('apple', 1, 'apple', 'apples', false), g('peanut butter', 16, 'peanut butter', false) ] },
  { id: 'tuna-ricecakes', name: 'Tuna on Rice Cakes', kind: 'snack', group: 'tuna', items: [
    g('canned tuna', 100, 'tuna'), n('rice cake', 3, 'rice cake', 'rice cakes') ] },
  { id: 'nuts-orange', name: 'Mixed Nuts & an Orange', kind: 'snack', group: 'nuts', items: [
    g('mixed nuts', 30, 'mixed nuts'), n('orange', 1, 'orange', 'oranges', false) ] },
  { id: 'skyr-almonds', name: 'Skyr & Almonds', kind: 'snack', group: 'yogurt', items: [
    g('skyr', 200, 'skyr'), g('almonds', 15, 'almonds', false) ] },
  { id: 'hummus-pitta', name: 'Hummus, Carrots & Pitta', kind: 'snack', group: 'hummus', items: [
    g('hummus', 60, 'hummus'), n('carrot', 2, 'carrot', 'carrots', false), n('pitta', 1, 'pitta', 'pittas', false) ] },
  { id: 'eggs-avocado', name: 'Boiled Eggs & Avocado', kind: 'snack', group: 'eggs', items: [
    n('boiled egg', 2, 'boiled egg', 'boiled eggs'), n('avocado', 0.5, 'avocado', undefined, false) ] },
  { id: 'cheese-crispbread', name: 'Cheese & Crispbread', kind: 'snack', group: 'cheese', items: [
    g('cheese', 30, 'cheese'), g('crispbread', 30, 'crispbread'), n('tomato', 1, 'tomato', 'tomatoes', false) ] },
  { id: 'chicken-ricecakes', name: 'Chicken & Rice Cakes', kind: 'snack', group: 'chicken-snack', items: [
    g('chicken breast', 100, 'chicken breast'), n('rice cake', 3, 'rice cake', 'rice cakes') ] },
];

// ── nutrition lookup ─────────────────────────────────────────────────────

function perGram(entry: FoodEntry): Macros | null {
  // meats store raw + cooked; recommendations are cooked weights
  const src = 'cooked' in entry && entry.cooked ? entry.cooked : (entry as Macros);
  if (!src || typeof src.cal !== 'number') return null;
  return { cal: src.cal / 100, prot: src.prot / 100, carb: src.carb / 100, fat: src.fat / 100 };
}

function ingredientMacros(entry: FoodEntry, ing: Ing, amt: number): Macros | null {
  if (ing.unit === 'g') {
    if (entry.type !== 'per100g') return null;
    const p = perGram(entry);
    return p ? { cal: p.cal * amt, prot: p.prot * amt, carb: p.carb * amt, fat: p.fat * amt } : null;
  }
  if (entry.type === 'per100g') return null;
  const e = entry as Macros;
  return { cal: e.cal * amt, prot: e.prot * amt, carb: e.carb * amt, fat: e.fat * amt };
}

// ── portioning ───────────────────────────────────────────────────────────

function roundGrams(v: number): number {
  return v >= 100 ? Math.round(v / 10) * 10 : Math.round(v / 5) * 5;
}

function scaleAmount(ing: Ing, s: number): number {
  if (!ing.scale) return ing.amt;
  // Piece counts only ever grow by one ("3 wraps" is a lunch, not a portion).
  if (ing.unit === 'n') return Math.min(ing.amt + (ing.amt >= 3 ? 1 : 0), Math.max(ing.min ?? 1, Math.round(ing.amt * s)));
  return Math.max(5, roundGrams(ing.amt * s));
}

function formatItem(ing: Ing, amt: number): string {
  if (ing.unit === 'g') return `${amt}g ${ing.name}`;
  if (amt === 0.5) return `½ ${ing.name}`;
  return `${amt} ${amt === 1 ? ing.name : ing.plural ?? ing.name + 's'}`;
}

function sum(parts: Macros[]): Macros {
  return parts.reduce((a, m) => ({ cal: a.cal + m.cal, prot: a.prot + m.prot, carb: a.carb + m.carb, fat: a.fat + m.fat }), { cal: 0, prot: 0, carb: 0, fat: 0 });
}

function buildPortion(t: Template, db: Record<string, FoodEntry>, s: number): { items: { text: string; amt: number }[]; macros: Macros } | null {
  const parts: Macros[] = [];
  const items: { text: string; amt: number }[] = [];
  for (const ing of t.items) {
    const entry = db[ing.food];
    if (!entry) return null;
    const amt = scaleAmount(ing, s);
    const m = ingredientMacros(entry, ing, amt);
    if (!m) return null;
    parts.push(m);
    items.push({ text: formatItem(ing, amt), amt });
  }
  return { items, macros: sum(parts) };
}

// ── recommendation ───────────────────────────────────────────────────────

export type MealOption = {
  id: string;
  name: string;
  items: string[];
  macros: Macros;
  /** One plain-English line on why this one fits. */
  why: string;
};

export type Recommendation =
  | { status: 'complete'; message: string }
  | { status: 'ok'; size: 'snack' | 'meal'; message: string; options: MealOption[] };

const r0 = (v: number) => Math.round(v);
const MORNING_OK = new Set(['steak', 'eggs', 'bagel', 'yogurt', 'oats', 'toast']);

function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

/** Share of the remaining calories a "next meal" should take, by time of day. */
function mealShare(hour: number): number {
  if (hour < 10) return 0.35;
  if (hour < 14) return 0.5;
  if (hour < 18) return 0.6;
  return 1; // evening: whatever's left is the last meal
}

export function recommendMeals(
  remainingRaw: Macros,
  db: Record<string, FoodEntry>,
  opts: { hour: number; seed: string; hasLogged: boolean; limit?: number },
): Recommendation {
  const rem: Macros = {
    cal: Math.max(0, remainingRaw.cal), prot: Math.max(0, remainingRaw.prot),
    carb: Math.max(0, remainingRaw.carb), fat: Math.max(0, remainingRaw.fat),
  };
  const limit = opts.limit ?? 6;

  // Essentially done — a big meal would be the wrong advice.
  if (rem.cal < 120 || (rem.prot < 8 && rem.cal < 200)) {
    return { status: 'complete', message: "You've pretty much hit today's targets — nice work. Nothing more needed; a water or herbal tea if you're peckish." };
  }

  const budget = Math.min(900, Math.max(Math.min(rem.cal, 250), rem.cal * mealShare(opts.hour)), rem.cal);
  const snackSized = budget < 320;
  const k = budget / rem.cal;
  const want: Macros = { cal: budget, prot: rem.prot * k, carb: rem.carb * k, fat: rem.fat * k };

  const candidates: { t: Template; items: { text: string; amt: number }[]; macros: Macros; score: number }[] = [];
  for (const t of TEMPLATES) {
    if (snackSized && t.kind !== 'snack') continue;
    if (!snackSized && t.kind === 'snack' && budget > 450) continue;
    if (t.kind === 'breakfast' && opts.hour >= 11) continue;

    let best: { items: { text: string; amt: number }[]; macros: Macros; score: number } | null = null;
    for (let s = 0.5; s <= 1.6001; s += 0.1) {
      const p = buildPortion(t, db, s);
      if (!p) break;
      const m = p.macros;
      // never recommend a portion that, on its own, breaks the day's calories
      if (m.cal > rem.cal * 1.02) continue;

      const eCal = Math.abs(m.cal - budget) / budget;
      const eProt = Math.abs(m.prot - want.prot) / Math.max(want.prot, 15);
      const eCarb = Math.abs(m.carb - want.carb) / Math.max(want.carb, 25);
      const eFat = Math.abs(m.fat - want.fat) / Math.max(want.fat, 8);
      let score = 1.4 * eCal + 1.2 * eProt + 0.7 * eCarb + 0.7 * eFat;
      // overshooting a single macro's remaining allowance is the real miss
      if (m.prot > rem.prot * 1.15 + 4) score += 1.5 * (m.prot - rem.prot) / Math.max(rem.prot, 15);
      if (m.carb > rem.carb * 1.15 + 6) score += 1.5 * (m.carb - rem.carb) / Math.max(rem.carb, 25);
      if (m.fat > rem.fat * 1.15 + 3) score += 1.5 * (m.fat - rem.fat) / Math.max(rem.fat, 8);
      // Mornings: real breakfasts first, and heavier dinner-style mains only
      // when they're genuinely breakfast food (steak & eggs, omelette, bagel).
      if (opts.hour < 11) {
        if (t.kind === 'breakfast') score -= 0.35;
        else if (!MORNING_OK.has(t.group)) score += 0.3;
      }
      if (!best || score < best.score) best = { items: p.items, macros: m, score };
    }
    if (best) candidates.push({ t, ...best, score: best.score + hash01(opts.seed + t.id) * 0.12 });
  }

  if (candidates.length === 0) {
    return { status: 'complete', message: "Today's targets are nearly covered — a small protein-rich snack is plenty if you want one." };
  }

  candidates.sort((a, b) => a.score - b.score);
  const picked: typeof candidates = [];
  const groups = new Set<string>();
  for (const c of candidates) {
    if (picked.length >= limit) break;
    if (groups.has(c.t.group)) continue;
    groups.add(c.t.group);
    picked.push(c);
  }
  for (const c of candidates) { // thin pools: fill with same-group alternatives
    if (picked.length >= Math.min(limit, 3)) break;
    if (!picked.includes(c)) picked.push(c);
  }

  const options: MealOption[] = picked.map((c) => ({
    id: c.t.id,
    name: c.t.name,
    items: c.items.map((i) => i.text),
    macros: { cal: r0(c.macros.cal), prot: r0(c.macros.prot), carb: r0(c.macros.carb), fat: r0(c.macros.fat) },
    why: explain(c.macros, rem),
  }));

  return { status: 'ok', size: snackSized ? 'snack' : 'meal', message: headline(rem, snackSized, opts.hasLogged), options };
}

function explain(m: Macros, rem: Macros): string {
  const gaps = [
    { key: 'protein', pct: rem.prot > 0 ? (m.prot / rem.prot) * 100 : 0, rem: rem.prot, min: 15 },
    { key: 'carbs', pct: rem.carb > 0 ? (m.carb / rem.carb) * 100 : 0, rem: rem.carb, min: 20 },
    { key: 'fats', pct: rem.fat > 0 ? (m.fat / rem.fat) * 100 : 0, rem: rem.fat, min: 8 },
  ].filter((x) => x.rem >= x.min);
  if (gaps.length === 0) return 'A light option for what you have left.';
  // lead with the biggest gap (by calories left) that this meal really dents
  const kcalLeft = (x: { key: string; rem: number }) => x.rem * (x.key === 'fats' ? 9 : 4);
  const dented = gaps.filter((x) => x.pct >= 50).sort((a, b) => kcalLeft(b) - kcalLeft(a));
  const lead = dented[0] ?? gaps.reduce((a, b) => (b.pct > a.pct ? b : a));
  if (lead.pct >= 90) return `Covers all of your remaining ${lead.key}.`;
  return `Covers about ${Math.round(lead.pct)}% of your remaining ${lead.key}.`;
}

function headline(rem: Macros, snack: boolean, hasLogged: boolean): string {
  if (snack) return "You're close to your targets, so I'd keep it small.";
  if (!hasLogged) return "Nothing logged yet — here's a solid way to start the day.";
  const shares = { protein: rem.prot * 4, carbs: rem.carb * 4, fats: rem.fat * 9 };
  const total = shares.protein + shares.carbs + shares.fats || 1;
  if (rem.prot >= 40 && shares.protein / total > 0.33) return `You've still got ${r0(rem.prot)}g of protein to go, so I'm prioritising it.`;
  if (shares.carbs / total > 0.55) return `Plenty of carbs left (${r0(rem.carb)}g) — this one uses them well.`;
  if (rem.fat >= 25 && shares.fats / total > 0.4) return `You've got ${r0(rem.fat)}g of fats left, so this has some good fats in it.`;
  return 'Here’s a realistic next meal for what you have left.';
}
