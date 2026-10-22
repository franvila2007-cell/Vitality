// Turns an IronBody Fit meal-plan form submission into what the plan is
// built from: the numbers the calculator needs (read straight off the form)
// and the client's food rules — what to leave out, what to build around.
//
// Exclusions are applied in two layers so one mistake can't slip through:
//   1. Checkbox answers map to allergen/diet tags deterministically.
//   2. Claude reads the free-text answers (dislikes, allergies,
//      intolerances) and maps them onto ingredient ids, tags and words.
// Then every library ingredient matching a tag, id or word is removed
// before recipes are written, and the validator checks the result again.
import * as z from 'zod/v4';
import type { Answers } from '@/lib/assessment/questions';
import { INGREDIENTS } from './ingredients.data';
import type { Ingredient, IngredientTag } from './ingredientTypes';
import { askClaude, type ClaudeUsage } from './claude';
import type { Flag, Sex, TargetsInput } from './targets';

const TAGS = ['gluten', 'dairy', 'egg', 'fish', 'shellfish', 'mollusc', 'seafood', 'tree_nut', 'peanut', 'sesame', 'soy', 'mustard', 'celery', 'legume', 'meat', 'red_meat', 'poultry', 'pork'] as const satisfies readonly IngredientTag[];
const INGREDIENT_IDS = INGREDIENTS.map((i) => i.id) as [string, ...string[]];

export type FoodRules = {
  excludedTags: IngredientTag[];
  excludedIngredientIds: string[];
  /** Lower-case words that must not appear in any recipe name or method */
  excludedTerms: string[];
  /** Dish styles to steer away from, e.g. "traditional Maltese dishes" */
  avoidDishStyles: string[];
  preferredIngredientIds: string[];
  /** One plain sentence for the plan, e.g. "All your meals are dairy-free, as requested." — empty when nothing was excluded */
  exclusionNote: string;
  /** Things Claude couldn't map with confidence */
  unclear: string[];
};

export type Intake = {
  firstName: string;
  fullName: string;
  targets: TargetsInput;
  rules: FoodRules;
  /** The ingredients recipes may use for this client */
  allowed: Ingredient[];
  cookingTime: string;
  mealStyle: string;
  flags: Flag[];
  usage: ClaudeUsage | null;
};

const str = (a: Answers, k: string) => (typeof a[k] === 'string' ? (a[k] as string).trim() : '');
const list = (a: Answers, k: string) => (Array.isArray(a[k]) ? (a[k] as string[]) : typeof a[k] === 'string' && a[k] ? [a[k] as string] : []);
const yes = (a: Answers, k: string) => str(a, k) === 'Yes';
const none = (s: string) => !s || /^(none|no|nothing|n\/a|na|-)\.?$/i.test(s.trim());

/** Checkbox answers (current and older versions of the form) → tags, deterministically. */
export function tagsFromDietChoices(diet: string[]): IngredientTag[] {
  const tags = new Set<IngredientTag>();
  for (const d of diet.map((x) => x.toLowerCase())) {
    if (d.includes('halal')) tags.add('pork');
    if (d.includes('gluten')) tags.add('gluten');
    if (d.includes('lactose') || d.includes('dairy')) tags.add('dairy');
    if (d.includes('vegetarian') || d.includes('vegan')) { tags.add('meat'); tags.add('seafood'); }
    if (d.includes('vegan')) { tags.add('dairy'); tags.add('egg'); }
    if (d.includes('pescatarian')) tags.add('meat');
  }
  return [...tags];
}

/** Applies the rules to the library. Pure — also used by the validator. */
export function allowedIngredients(rules: Pick<FoodRules, 'excludedTags' | 'excludedIngredientIds' | 'excludedTerms'>): Ingredient[] {
  const tags = new Set(rules.excludedTags);
  const ids = new Set(rules.excludedIngredientIds);
  const terms = rules.excludedTerms.map((t) => t.toLowerCase()).filter(Boolean);
  return INGREDIENTS.filter((ing) => {
    if (ids.has(ing.id)) return false;
    if (ing.tags.some((t) => tags.has(t))) return false;
    const words = [ing.name, ...ing.aliases].join(' | ').toLowerCase();
    return !terms.some((t) => words.includes(t));
  });
}

const RulesSchema = z.object({
  excluded_ingredient_ids: z.array(z.enum(INGREDIENT_IDS)),
  excluded_tags: z.array(z.enum(TAGS)),
  excluded_terms: z.array(z.string()),
  avoid_dish_styles: z.array(z.string()),
  preferred_ingredient_ids: z.array(z.enum(INGREDIENT_IDS)),
  exclusion_note: z.string(),
  unclear: z.array(z.string()),
});

const SYSTEM = `You read a client's answers from a nutrition questionnaire and turn their food preferences into rules for a meal-plan generator. You only map what the client actually said onto the ingredient library and tags you are given — never invent restrictions they didn't state, and never drop one they did.

Rules:
- Allergies and intolerances: exclude every ingredient they could react to, via tags where one fits (e.g. "dairy" for lactose intolerance, "shellfish" for a prawn allergy, "tree_nut" for nut allergies) plus specific ingredient ids.
- Dislikes / refusals: exclude the matching ingredient ids, and add simple lower-case words to excluded_terms so the dish names and methods avoid them too (e.g. "cheese", "mushroom"). If they dislike a cuisine or dish style (e.g. "Maltese food"), put it in avoid_dish_styles rather than excluding ingredients.
- Preferences: preferred_ingredient_ids are library ingredients they say they enjoy or eat often. If they say they eat anything, leave it empty.
- exclusion_note: one short, friendly sentence for the plan naming what was left out, e.g. "All your meals are dairy-free and contain no cheese, as requested." Empty string if nothing was excluded.
- unclear: anything about allergies or intolerances you could not confidently map (the coach will check). Empty if all clear.`;

export async function readIntake(answers: Answers): Promise<Intake> {
  const flags: Flag[] = [];
  const fullName = str(answers, 'full_name').replace(/\s+/g, ' ');
  const firstName = fullName.split(' ')[0] ?? '';
  const sex = str(answers, 'sex') as Sex;
  const mealsRaw = Number(str(answers, 'meals_per_day'));
  const sessionsRaw = str(answers, 'exercise_sessions');

  const targets: TargetsInput = {
    sex,
    age: Number(str(answers, 'age')),
    heightCm: Number(str(answers, 'height')),
    weightKg: Number(str(answers, 'weight')),
    sessionsPerWeek: sessionsRaw === '' ? null : Number(sessionsRaw),
    // The form no longer offers 1 meal; an old 1-meal answer becomes 2 and is flagged.
    mealsPerDay: mealsRaw >= 3 ? 3 : 2,
    hungriest: str(answers, 'hungriest') || null,
    hasMedicalCondition: yes(answers, 'conditions'),
    takesMedication: yes(answers, 'medications'),
  };
  if (mealsRaw === 1) flags.push({ code: 'meal_count', message: 'Asked for 1 meal a day — the plan uses 2 meals. Check with the client.' });

  const dietTags = tagsFromDietChoices(list(answers, 'diet'));
  const freeText = {
    diet_choices: list(answers, 'diet'),
    foods_enjoyed: str(answers, 'foods_enjoy'),
    foods_disliked_or_refused: str(answers, 'foods_dislike'),
    foods_eaten_often: str(answers, 'foods_frequent'),
    allergies: yes(answers, 'allergies') ? str(answers, 'allergies_detail') : 'none',
    intolerances: yes(answers, 'intolerances') ? str(answers, 'intolerances_detail') : 'none',
  };

  const needsClaude = !none(freeText.foods_disliked_or_refused) || !none(freeText.allergies) || !none(freeText.intolerances) || !none(freeText.foods_enjoyed) || !none(freeText.foods_eaten_often) || freeText.diet_choices.length > 0;

  let rules: FoodRules = { excludedTags: dietTags, excludedIngredientIds: [], excludedTerms: [], avoidDishStyles: [], preferredIngredientIds: [], exclusionNote: '', unclear: [] };
  let usage: ClaudeUsage | null = null;
  if (needsClaude) {
    const library = INGREDIENTS.map((i) => `${i.id}: ${i.name} [${i.tags.join(', ')}]`).join('\n');
    const { data, usage: u } = await askClaude({
      system: SYSTEM,
      prompt: `Ingredient library (id: name [tags]):\n${library}\n\nAvailable tags: ${TAGS.join(', ')}\n\nTags already excluded from their checkbox answers: ${dietTags.join(', ') || 'none'}\n\nClient answers:\n${JSON.stringify(freeText, null, 2)}`,
      schema: RulesSchema,
      effort: 'medium',
    });
    usage = u;
    rules = {
      excludedTags: [...new Set([...dietTags, ...data.excluded_tags])],
      excludedIngredientIds: data.excluded_ingredient_ids,
      excludedTerms: [...new Set(data.excluded_terms.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 3))],
      avoidDishStyles: data.avoid_dish_styles,
      preferredIngredientIds: data.preferred_ingredient_ids,
      exclusionNote: data.exclusion_note.trim(),
      unclear: data.unclear,
    };
  }

  for (const u of rules.unclear) flags.push({ code: 'check_exclusions', message: `Check exclusions: ${u}` });
  const hasRestriction = !none(freeText.allergies) || !none(freeText.intolerances);
  if (hasRestriction && rules.excludedTags.length === 0 && rules.excludedIngredientIds.length === 0) {
    flags.push({ code: 'check_exclusions', message: 'They listed an allergy or intolerance but nothing could be excluded for it — check before sending.' });
  }

  const allowed = allowedIngredients(rules);
  // A preferred food that is also excluded stays excluded.
  rules.preferredIngredientIds = rules.preferredIngredientIds.filter((id) => allowed.some((i) => i.id === id));

  return {
    firstName, fullName, targets, rules, allowed,
    cookingTime: str(answers, 'cooking_time'),
    mealStyle: str(answers, 'meal_style'),
    flags, usage,
  };
}
