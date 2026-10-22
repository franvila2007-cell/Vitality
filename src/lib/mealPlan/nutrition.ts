// Recipe nutrition for the automated meal plans: every number comes from
// the USDA ingredient library (ingredients.data.ts) × the grams in the
// recipe. The model proposes which ingredients go in a dish; this file
// decides how much of each and what the dish adds up to.
//
// Energy uses the standard 4 / 4 / 9 kcal per gram of protein / carbs /
// fat, the same values the daily targets use, so a day of recipes adds up
// against the targets exactly. (USDA's own kcal figure is kept on each
// ingredient for audit only.)
import { INGREDIENTS } from './ingredients.data';
import type { Ingredient } from './ingredientTypes';

export const NUTRITION_VERSION = 'nutrition-v1';

export const INGREDIENT_BY_ID: ReadonlyMap<string, Ingredient> = new Map(INGREDIENTS.map((i) => [i.id, i]));

/** How the portion fitter may change an ingredient: scale it to hit protein, scale it to hit calories, or leave it. */
export type PortionRole = 'protein' | 'carb' | 'fixed';

export type RecipeItem = { ingredientId: string; grams: number; role: PortionRole };

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };

export type ItemNutrition = Macros & {
  ingredientId: string; name: string; grams: number; role: PortionRole;
  state: Ingredient['state']; fdcId: number; usdaDescription: string;
};

export type RecipeNutrition = {
  items: ItemNutrition[];
  /** Exact sums, unrounded */
  exact: Macros;
  /** As printed: kcal to the nearest 5, macros to the nearest gram */
  display: Macros;
};

const kcalOf = (p: number, c: number, f: number) => p * 4 + c * 4 + f * 9;

export function ingredient(id: string): Ingredient {
  const ing = INGREDIENT_BY_ID.get(id);
  if (!ing) throw new Error(`Unknown ingredient "${id}"`);
  return ing;
}

export function itemNutrition(item: RecipeItem): ItemNutrition {
  const ing = ingredient(item.ingredientId);
  const k = item.grams / 100;
  const protein = ing.per100g.protein * k;
  const carbs = ing.per100g.carbs * k;
  const fat = ing.per100g.fat * k;
  return {
    ingredientId: ing.id, name: ing.name, grams: item.grams, role: item.role,
    state: ing.state, fdcId: ing.fdcId, usdaDescription: ing.usdaDescription,
    kcal: kcalOf(protein, carbs, fat), protein, carbs, fat,
  };
}

export function recipeNutrition(items: RecipeItem[]): RecipeNutrition {
  const rows = items.map(itemNutrition);
  const exact = rows.reduce<Macros>((a, r) => ({ kcal: a.kcal + r.kcal, protein: a.protein + r.protein, carbs: a.carbs + r.carbs, fat: a.fat + r.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  return {
    items: rows,
    exact,
    display: { kcal: Math.round(exact.kcal / 5) * 5, protein: Math.round(exact.protein), carbs: Math.round(exact.carbs), fat: Math.round(exact.fat) },
  };
}

// ── Portion fitting ──────────────────────────────────────────────────────

export type FitTarget = { kcal: number; protein: number };

export type FitResult = {
  items: RecipeItem[];
  nutrition: RecipeNutrition;
  /** Within the tolerance of the meal's calorie target */
  ok: boolean;
  kcalOffPct: number;
  proteinOffPct: number;
  notes: string[];
};

/** Recipe options may be this far from their meal's calorie target (±) so swaps barely move the day. */
export const KCAL_TOLERANCE = 0.075;

const ROUND_G = 5;
const roundG = (g: number) => Math.round(g / ROUND_G) * ROUND_G;
const clamp = (g: number, ing: Ingredient) => Math.min(ing.maxG, Math.max(ing.minG, g));

/**
 * Scales the 'protein' and 'carb' ingredients of a recipe so it lands on the
 * meal's calorie and protein targets, keeping every quantity inside that
 * ingredient's realistic range and rounded to 5 g. Ingredients sharing a
 * role are scaled together, keeping their proportions. Fixed ingredients
 * (fats, veg, flavourings) stay as proposed.
 */
export function fitPortions(proposed: RecipeItem[], target: FitTarget): FitResult {
  const notes: string[] = [];
  const fixed = proposed.filter((i) => i.role === 'fixed');
  const prot = proposed.filter((i) => i.role === 'protein');
  const carb = proposed.filter((i) => i.role === 'carb');

  // Nutrition of each scalable group at the proposed grams (scale factor 1).
  const sum = (items: RecipeItem[]) => recipeNutrition(items).exact;
  const F = sum(fixed);
  const P = sum(prot);
  const C = sum(carb);

  // Solve  a·P + b·C + F = target  for the scale factors a (protein group)
  // and b (carb group), on protein grams and kcal.
  let a = 1;
  let b = 1;
  if (prot.length && carb.length) {
    const det = P.protein * C.kcal - C.protein * P.kcal;
    if (Math.abs(det) > 1e-9) {
      a = ((target.protein - F.protein) * C.kcal - C.protein * (target.kcal - F.kcal)) / det;
      b = (P.protein * (target.kcal - F.kcal) - P.kcal * (target.protein - F.protein)) / det;
    }
    if (!(a > 0) || !(b > 0) || !Number.isFinite(a) || !Number.isFinite(b)) {
      // Can't hit both exactly: hit protein with the protein group, then calories with carbs.
      a = P.protein > 0 ? Math.max(0.1, (target.protein - F.protein - C.protein) / P.protein) : 1;
      b = C.kcal > 0 ? Math.max(0.1, (target.kcal - F.kcal - a * P.kcal) / C.kcal) : 1;
      notes.push('protein and calories could not both be matched exactly');
    }
  } else if (prot.length) {
    a = P.kcal > 0 ? Math.max(0.1, (target.kcal - F.kcal - C.kcal) / P.kcal) : 1;
  } else if (carb.length) {
    b = C.kcal > 0 ? Math.max(0.1, (target.kcal - F.kcal - P.kcal) / C.kcal) : 1;
  }

  const scale = (items: RecipeItem[], k: number) => items.map((i) => {
    const ing = ingredient(i.ingredientId);
    const want = i.grams * k;
    const g = roundG(clamp(want, ing));
    if (Math.abs(clamp(want, ing) - want) > 0.5) notes.push(`${ing.name} held at its ${want > ing.maxG ? 'maximum' : 'minimum'} of ${g} g`);
    return { ...i, grams: g };
  });

  let items = [...scale(prot, a), ...scale(carb, b), ...fixed];

  // If clamping on one group pushed calories out, let the other group take up the slack.
  let nutrition = recipeNutrition(items);
  const gap = target.kcal - nutrition.exact.kcal;
  if (Math.abs(gap) / target.kcal > KCAL_TOLERANCE / 2 && carb.length) {
    const fittedCarb = recipeNutrition(scale(carb, b)).exact.kcal;
    if (fittedCarb > 0) {
      items = [...scale(prot, a), ...scale(carb, b * (1 + gap / fittedCarb)), ...fixed];
      nutrition = recipeNutrition(items);
    }
  }

  // Keep the recipe's original ingredient order for display.
  const order = new Map(proposed.map((i, idx) => [i.ingredientId, idx]));
  items.sort((x, y) => (order.get(x.ingredientId) ?? 0) - (order.get(y.ingredientId) ?? 0));
  nutrition = recipeNutrition(items);

  const kcalOffPct = (nutrition.exact.kcal - target.kcal) / target.kcal;
  const proteinOffPct = target.protein > 0 ? (nutrition.exact.protein - target.protein) / target.protein : 0;
  return { items, nutrition, ok: Math.abs(kcalOffPct) <= KCAL_TOLERANCE, kcalOffPct, proteinOffPct, notes: Array.from(new Set(notes)) };
}
