// Recipe creation: Claude proposes the dishes (which ingredients, roughly
// how much, how to cook them) from the client's allowed ingredients only;
// the portion fitter then sets the exact grams so each option lands on its
// meal's calorie and protein target, and nutrition is computed from USDA.
import * as z from 'zod/v4';
import type { Intake } from './intake';
import type { MealSlot, MealTarget } from './targets';
import { askClaude, type ClaudeUsage } from './claude';
import { fitPortions, ingredient, type FitResult, type RecipeItem } from './nutrition';

export const OPTIONS_PER_MEAL = 4;

export type Recipe = {
  slot: MealSlot;
  name: string;
  method: string;
  /** Search words for the stock photo, e.g. "baked salmon with potatoes and green beans" */
  photoQuery: string;
  mainProteinId: string;
  mainCarbId: string | null;
  fit: FitResult;
};

const SYSTEM = `You write recipes for Vitality × IronBody Fit personalised meal plans. The plan's philosophy: fresh whole foods — meat, poultry, fish, eggs and dairy where tolerated, with fruit, vegetables, potatoes, sweet potatoes and rice. Quality ingredients, sensible portions, nothing ultra-processed.

Rules for every recipe:
- Use ONLY ingredient ids from the client's allowed list. Anything not on the list is off-limits, including in sauces, garnishes and "optional" extras.
- Cook with butter or ghee (or, if those aren't on the list, coconut oil, avocado oil or beef tallow). Olive oil is used raw only — drizzled or as a dressing, never for frying, roasting or baking. The method must reflect this.
- Carbohydrates: build meals mainly on potatoes, rice, sweet potatoes and couscous, plus fruit. Avoid wheat, flour and grain products — bread, wraps, tortillas, noodles, crackers, crispbreads, bulgur — wherever possible. Oats, pasta and sourdough are fine occasionally: at most two recipes in the whole plan may use any of oats, pasta, sourdough or other bread, and at most one of those may use oats. If the client's food rules leave no other option, use them anyway.
- Practical home cooking within the client's cooking time. Short, clear method: 1–3 sentences, like "Roast the potatoes in ghee at 200°C until golden; grill the chicken and serve with the courgette."
- Natural, appealing dish names, e.g. "Honey Chicken with Potatoes", "Garlic Prawns and Rice". Never name a cuisine or style the client wants to avoid.
- Within one meal, the four options must be genuinely different dishes: a different main protein or a different carbohydrate and cooking style — not the same dish with one swap.
- Build around the foods the client already enjoys and eats often.
- Breakfasts should be simple and quick (eggs, yoghurt or similar if allowed, fruit, potatoes or sweet potatoes, or occasionally oats or sourdough). Lunches and dinners are hearty plates.
- Give each ingredient a role: "protein" for the main protein source(s), "carb" for the main carbohydrate source(s), "fixed" for everything else (veg, fruit, fats, flavourings). Quantities of protein and carb items are fine-tuned automatically afterwards to hit the meal's calories, so give realistic starting grams close to the meal's target. Include the cooking fat and any honey, sauce or oil as ingredients — everything is counted.
- Every recipe needs a main protein. Include enough energy-dense food (rice, pasta, potatoes, fats) for big meals to reach their calories.
- photo_query: a short description of the finished plate for a stock-photo search, e.g. "grilled chicken breast with roast potatoes and courgette".
- Do not mention meal times.`;

function recipeSchema(allowedIds: [string, ...string[]], slots: [MealSlot, ...MealSlot[]]) {
  return z.object({
    recipes: z.array(z.object({
      slot: z.enum(slots),
      name: z.string(),
      method: z.string(),
      photo_query: z.string(),
      ingredients: z.array(z.object({
        ingredient_id: z.enum(allowedIds),
        grams: z.number(),
        role: z.enum(['protein', 'carb', 'fixed']),
      })),
    })),
  });
}

type Proposed = z.infer<ReturnType<typeof recipeSchema>>['recipes'][number];

function toRecipe(p: Proposed, meal: MealTarget): Recipe {
  const items: RecipeItem[] = [];
  for (const i of p.ingredients) {
    const existing = items.find((x) => x.ingredientId === i.ingredient_id);
    if (existing) existing.grams += Math.max(0, i.grams);
    else items.push({ ingredientId: i.ingredient_id, grams: Math.max(0, i.grams), role: i.role });
  }
  // Fixed items keep the proposed amount, within that ingredient's realistic range.
  for (const it of items) {
    if (it.role !== 'fixed') continue;
    const ing = ingredient(it.ingredientId);
    it.grams = Math.min(ing.maxG, Math.max(ing.minG, Math.round(it.grams)));
  }
  const fit = fitPortions(items, { kcal: meal.kcal, protein: meal.protein });
  const byWeight = (role: string) => fit.items.filter((i) => i.role === role).sort((a, b) => b.grams - a.grams)[0]?.ingredientId ?? null;
  return { slot: p.slot, name: p.name.trim(), method: p.method.trim(), photoQuery: p.photo_query.trim(), mainProteinId: byWeight('protein') ?? '', mainCarbId: byWeight('carb'), fit };
}

function clientBrief(intake: Intake, meals: MealTarget[]): string {
  const { rules } = intake;
  const allowed = intake.allowed.map((i) => `${i.id}: ${i.name} (${i.category}, ${i.state}, ${i.minG}–${i.maxG} g)`).join('\n');
  const preferred = intake.allowed.filter((i) => rules.preferredIngredientIds.includes(i.id)).map((i) => i.name);
  return [
    `Meals to write, ${OPTIONS_PER_MEAL} options each:`,
    ...meals.map((m) => `- ${m.slot}: about ${m.kcal} kcal and ${m.protein} g protein per option`),
    '',
    `Foods they enjoy / eat often: ${preferred.length ? preferred.join(', ') : 'no strong preferences'}`,
    `Avoid these dish styles: ${rules.avoidDishStyles.join(', ') || 'none'}`,
    `Words that must not appear in any dish name or method: ${rules.excludedTerms.join(', ') || 'none'}`,
    `Cooking time available: ${intake.cookingTime || 'not given'}`,
    `Meal style: ${intake.mealStyle || 'not given'}`,
    '',
    'Allowed ingredients (id: name (category, how it is weighed, realistic range per meal)):',
    allowed,
  ].join('\n');
}

function setup(intake: Intake, meals: MealTarget[]) {
  const allowedIds = intake.allowed.map((i) => i.id) as [string, ...string[]];
  const slots = meals.map((m) => m.slot) as [MealSlot, ...MealSlot[]];
  return { slots, schema: recipeSchema(allowedIds, slots), mealBySlot: new Map(meals.map((m) => [m.slot, m])), brief: clientBrief(intake, meals) };
}

const sortBySlot = (recipes: Recipe[], slots: MealSlot[]) => {
  const order = new Map(slots.map((s, i) => [s, i]));
  return [...recipes].sort((a, b) => order.get(a.slot)! - order.get(b.slot)!);
};

/** Recipes that still need writing: per meal, how many more fitted options are needed. */
export function missingOptions(recipes: Recipe[], meals: MealTarget[]): { slot: MealSlot; n: number }[] {
  return meals.map((m) => ({ slot: m.slot, n: OPTIONS_PER_MEAL - recipes.filter((r) => r.slot === m.slot && r.fit.ok).length })).filter((x) => x.n > 0);
}

/** First pass: OPTIONS_PER_MEAL recipes for each meal, portions fitted. */
export async function proposeRecipes(intake: Intake, meals: MealTarget[]): Promise<{ recipes: Recipe[]; usage: ClaudeUsage }> {
  const { slots, schema, mealBySlot, brief } = setup(intake, meals);
  const first = await askClaude({ system: SYSTEM, prompt: brief, schema, effort: 'medium', maxTokens: 24000 });
  const kept: Recipe[] = [];
  for (const slot of slots) {
    for (const p of first.data.recipes.filter((r) => r.slot === slot).slice(0, OPTIONS_PER_MEAL)) kept.push(toRecipe(p, mealBySlot.get(slot)!));
  }
  return { recipes: sortBySlot(kept, slots), usage: first.usage };
}

/**
 * Repair pass: replaces recipes that couldn't be fitted to their meal's
 * calories and fills any gaps. Whatever still fails stays with fit.ok = false
 * for the validator to flag.
 */
export async function repairRecipes(intake: Intake, meals: MealTarget[], current: Recipe[]): Promise<{ recipes: Recipe[]; usage: ClaudeUsage | null }> {
  const { slots, schema, mealBySlot, brief } = setup(intake, meals);
  const missing = missingOptions(current, meals);
  if (!missing.length) return { recipes: current, usage: null };
  const kept = [...current];
  const failed = kept.filter((r) => !r.fit.ok);
  const keptNames = kept.filter((r) => r.fit.ok).map((r) => `${r.slot}: ${r.name}`);
  const why = failed.map((r) => `- "${r.name}" (${r.slot}) reached ${Math.round(r.fit.nutrition.exact.kcal)} kcal against ${mealBySlot.get(r.slot)!.kcal} kcal${r.fit.notes.length ? ` — ${r.fit.notes.join('; ')}` : ''}`);
  const repair = await askClaude({
    system: SYSTEM,
    prompt: `${brief}\n\nAlready accepted (don't repeat these dishes):\n${keptNames.join('\n') || 'none'}\n\n${why.length ? `These recipes couldn't reach their calories within realistic portions and are being replaced:\n${why.join('\n')}\n\n` : ''}Write only these replacements: ${missing.map((m) => `${m.n} × ${m.slot}`).join(', ')}.`,
    schema, effort: 'medium', maxTokens: 16000,
  });
  for (const m of missing) {
    const replacements = repair.data.recipes.filter((r) => r.slot === m.slot).slice(0, m.n).map((p) => toRecipe(p, mealBySlot.get(m.slot)!));
    const slotFailed = kept.filter((r) => r.slot === m.slot && !r.fit.ok);
    for (const rep of replacements) {
      // A replacement that fits replaces a failed one; one that doesn't is only used to fill a gap.
      const idx = slotFailed.length && rep.fit.ok ? kept.indexOf(slotFailed.shift()!) : -1;
      if (idx >= 0) kept[idx] = rep;
      else if (kept.filter((r) => r.slot === m.slot).length < OPTIONS_PER_MEAL) kept.push(rep);
    }
  }
  return { recipes: sortBySlot(kept, slots), usage: repair.usage };
}
