// Quality control for a finished meal plan, run before anything goes to
// Gamma. Deterministic: it re-derives everything from the plan data rather
// than trusting what earlier steps said.
//   blocker → the plan is not sent to Gamma (no credits used) until fixed
//   review  → the plan is made, and the coach sees the warning with the link
import { allowedIngredients, type FoodRules } from './intake';
import { INGREDIENT_BY_ID, recipeNutrition } from './nutrition';
import { OPTIONS_PER_MEAL, type Recipe } from './recipes';
import type { Targets } from './targets';

export type Issue = { level: 'blocker' | 'review'; message: string };

export type PlanForValidation = {
  fullName: string;
  targets: Targets;
  rules: FoodRules;
  recipes: Recipe[];
  /** photo url per recipe name, when photos have been chosen */
  photos?: Map<string, string | null>;
};

const TIME_RE = /\b([01]?\d|2[0-3])[:.][0-5]\d\b|\b\d{1,2}\s?(am|pm)\b/i;
const COOK_WITH_OLIVE_OIL_RE = /(fry|fried|roast|bake|sear|saut[eé]|grill|cook|brown|pan)[^.;]{0,40}\bolive oil\b|\bolive oil\b[^.;]{0,25}(fry|roast|bake|sear|saut[eé]|grill|cook|brown)/i;

const wordIn = (text: string, word: string) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text);

export function validatePlan(plan: PlanForValidation): Issue[] {
  const issues: Issue[] = [];
  const blocker = (message: string) => issues.push({ level: 'blocker', message });
  const review = (message: string) => issues.push({ level: 'review', message });
  const { targets, rules, recipes } = plan;

  if (!plan.fullName.trim()) blocker('Client name is missing.');

  // ── Targets ────────────────────────────────────────────────────────────
  const macroKcal = targets.protein * 4 + targets.carbs * 4 + targets.fat * 9;
  if (Math.abs(macroKcal - targets.targetKcal) > 20) blocker(`Macros add up to ${macroKcal} kcal, not ${targets.targetKcal} kcal.`);
  if (targets.deficitApplied && targets.maintenanceKcal - targets.targetKcal !== 300) blocker('Target is not 300 kcal below maintenance.');
  if (targets.targetKcal % 50 !== 0) blocker('Target calories are not rounded to the nearest 50.');
  if (targets.meals.reduce((s, m) => s + m.kcal, 0) !== targets.targetKcal) blocker('Meal calories do not add up to the daily target.');
  for (const f of targets.flags) review(f.message);

  // ── Meal frequency ─────────────────────────────────────────────────────
  const slots = targets.meals.map((m) => m.slot);
  for (const r of recipes) if (!slots.includes(r.slot)) blocker(`"${r.name}" is a ${r.slot} recipe but the plan has no ${r.slot}.`);
  for (const m of targets.meals) {
    const n = recipes.filter((r) => r.slot === m.slot).length;
    if (n !== OPTIONS_PER_MEAL) blocker(`${m.label} has ${n} options instead of ${OPTIONS_PER_MEAL}.`);
  }
  if (!slots.includes('breakfast')) {
    for (const r of recipes) if (/\b(breakfast|brunch|snack)\b/i.test(`${r.name} ${r.method}`)) blocker(`"${r.name}" mentions breakfast or a snack in a ${slots.length}-meal plan.`);
  }

  // ── Exclusions (re-checked from scratch) ───────────────────────────────
  const allowed = new Set(allowedIngredients(rules).map((i) => i.id));
  const excludedTags = new Set(rules.excludedTags);
  for (const r of recipes) {
    for (const it of r.fit.items) {
      const ing = INGREDIENT_BY_ID.get(it.ingredientId);
      if (!ing) { blocker(`"${r.name}" uses an unknown ingredient (${it.ingredientId}).`); continue; }
      if (!allowed.has(ing.id) || ing.tags.some((t) => excludedTags.has(t))) blocker(`"${r.name}" contains ${ing.name}, which this client can't have.`);
      if (it.grams < ing.minG || it.grams > ing.maxG) review(`"${r.name}": ${it.grams} g of ${ing.name} is outside the usual ${ing.minG}–${ing.maxG} g.`);
    }
    const text = `${r.name}. ${r.method}`;
    for (const term of rules.excludedTerms) if (wordIn(text, term)) blocker(`"${r.name}" mentions "${term}", which the client asked to avoid.`);
    for (const style of rules.avoidDishStyles) {
      const key = style.toLowerCase().replace(/\b(traditional|food|foods|dishes|dish|cuisine|style)\b/g, '').trim();
      if (key.length >= 3 && wordIn(text, key)) blocker(`"${r.name}" looks like ${style}, which the client asked to avoid.`);
    }
  }

  // ── Recipe quality ─────────────────────────────────────────────────────
  for (const r of recipes) {
    const meal = targets.meals.find((m) => m.slot === r.slot);
    if (!r.mainProteinId) blocker(`"${r.name}" has no main protein.`);
    if (meal && !r.fit.ok) review(`"${r.name}" is ${Math.round(r.fit.nutrition.exact.kcal)} kcal against the ${meal.kcal} kcal ${meal.label.toLowerCase()} target.`);
    if (meal && Math.abs(r.fit.proteinOffPct) > 0.2) review(`"${r.name}" has ${Math.round(r.fit.nutrition.exact.protein)} g protein against the ${meal.protein} g ${meal.label.toLowerCase()} target.`);
    if (!r.method.trim() || r.method.length > 450) review(`"${r.name}" needs a short method.`);
    if (COOK_WITH_OLIVE_OIL_RE.test(r.method)) blocker(`"${r.name}" cooks with olive oil — olive oil is for raw use only.`);
    if (TIME_RE.test(`${r.name} ${r.method}`)) blocker(`"${r.name}" mentions a clock time.`);
    // Nutrition must be exactly what the USDA library gives for these grams.
    const again = recipeNutrition(r.fit.items).display;
    const shown = r.fit.nutrition.display;
    if (again.kcal !== shown.kcal || again.protein !== shown.protein || again.carbs !== shown.carbs || again.fat !== shown.fat) blocker(`"${r.name}" nutrition doesn't match its ingredients.`);
  }

  const oatRecipes = recipes.filter((r) => r.fit.items.some((i) => i.ingredientId === 'oats'));
  if (oatRecipes.length > 1) review(`${oatRecipes.length} recipes use oats — keep it to one at most.`);

  // ── Distinct options ───────────────────────────────────────────────────
  for (const slot of slots) {
    const inSlot = recipes.filter((r) => r.slot === slot);
    const names = new Set<string>();
    const pairs = new Set<string>();
    for (const r of inSlot) {
      const n = r.name.toLowerCase();
      if (names.has(n)) blocker(`Two ${slot} options are both called "${r.name}".`);
      names.add(n);
      const pair = `${r.mainProteinId}|${r.mainCarbId ?? ''}`;
      if (pairs.has(pair)) review(`Two ${slot} options use the same main protein and carbohydrate ("${r.name}") — make them more different.`);
      pairs.add(pair);
    }
  }

  // ── Photos ─────────────────────────────────────────────────────────────
  if (plan.photos) {
    for (const r of recipes) if (!plan.photos.get(r.name)) review(`No matching stock photo found for "${r.name}" — add one in Gamma.`);
  }

  return issues;
}
