// Builds the instructions for generating a client's plan from the master
// Gamma template. The rule (from the coach): keep every page, its wording,
// design and branding exactly as the template — change only the client's
// name, goal, calories, macros, meal structure, recipes and recipe photos,
// and leave out any food the client can't have.
//
// Every changed text is written out here in full, so Gamma lays it out
// rather than writing anything itself.
import type { FoodRules } from './intake';
import { allowedIngredients } from './intake';
import type { Recipe } from './recipes';
import type { Targets } from './targets';

/** Master template: https://gamma.app/docs/Vitality-x-IronBody-Fit-Meal-Plan-ga6qb7jmek6n2ty */
export const MASTER_TEMPLATE_ID = 'g_k6cleceikwa2zzb';

/** The template's cover heading — every plan keeps it word for word; the client's name goes only in the welcome line. */
export const COVER_HEADING = 'VITALITY × IronBody Fit Personal Meal Plan';

export type GammaPlanInput = {
  fullName: string;
  firstName: string;
  targets: Targets;
  rules: FoodRules;
  recipes: Recipe[];
  /** stock photo url per recipe name */
  photos: Map<string, string | null>;
};

const NUM_WORD: Record<number, string> = { 2: 'two', 3: 'three' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The template's list items, each kept only if the client can eat at least one of its ingredients. */
function keepFoods(phrases: [string, string[]][], allowed: Set<string>): string[] {
  return phrases.filter(([, ids]) => ids.length === 0 || ids.some((id) => allowed.has(id))).map(([p]) => p);
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function recipeIngredientsLine(r: Recipe): string {
  const parts = r.fit.items.map((it) => {
    const name = r.fit.nutrition.items.find((n) => n.ingredientId === it.ingredientId)?.name ?? it.ingredientId;
    // Pinches of spice read better without a weight; they're still counted.
    return it.grams < 5 ? name : `${it.grams}g ${name}`;
  });
  return parts.join(', ');
}

function recipeCard(r: Recipe, photo: string | null, prefix = ''): string {
  const d = r.fit.nutrition.display;
  return [
    `### ${prefix}${r.name}`,
    photo ? `Image (use this exact photo for this recipe): ${photo}` : 'Image: leave this recipe without a photo.',
    `${recipeIngredientsLine(r)}. ${r.method}`,
    `**${d.kcal} kcal · P: ${d.protein}g · C: ${d.carbs}g · F: ${d.fat}g**`,
  ].join('\n');
}

/** What the lunches/dinners are "built around", from the recipes themselves. */
function builtAround(recipes: Recipe[]): string {
  const words = new Set<string>();
  const label: Record<string, string> = {
    chicken: 'chicken', turkey: 'turkey', beef: 'beef', steak: 'beef', lamb: 'lamb', pork: 'pork',
    salmon: 'fish', cod: 'fish', haddock: 'fish', bass: 'fish', tilapia: 'fish', trout: 'fish', mackerel: 'fish', tuna: 'fish', sardines: 'fish',
    prawns: 'prawns', squid: 'seafood', octopus: 'seafood', eggs: 'eggs',
    potatoes: 'potatoes', potato: 'potatoes', rice: 'rice', pasta: 'pasta', quinoa: 'quinoa', couscous: 'couscous', bread: 'bread', sourdough: 'bread', noodles: 'noodles',
  };
  for (const r of recipes) {
    for (const id of [r.mainProteinId, r.mainCarbId]) {
      if (!id) continue;
      const hit = Object.keys(label).find((k) => id.includes(k.replace(/s$/, '')) || id.includes(k));
      if (hit) words.add(label[hit]);
    }
  }
  return joinList([...words, 'vegetables']);
}

export function buildGammaPrompt(p: GammaPlanInput): { title: string; prompt: string } {
  const { targets: t, rules, recipes, firstName } = p;
  const n = t.meals.length;
  const nWord = NUM_WORD[n];
  const allowed = new Set(allowedIngredients(rules).map((i) => i.id));
  const note = rules.exclusionNote ? ` ${rules.exclusionNote}` : '';
  const kcalOf = (slot: string) => t.meals.find((m) => m.slot === slot)?.kcal ?? 0;
  const bySlot = (slot: string) => recipes.filter((r) => r.slot === slot);
  const photo = (r: Recipe) => p.photos.get(r.name) ?? null;

  const MEAL_LINE: Record<string, string> = {
    breakfast: 'A satisfying morning meal',
    lunch: 'A satisfying, hearty meal with protein, potatoes and vegetables',
    dinner: 'A larger meal with protein, whole-food carbohydrates and fats',
  };

  const targetsIntro = t.deficitApplied
    ? `Your maintenance level is ${t.maintenanceKcal} calories. A daily target of ${t.targetKcal} calories creates a 300 calorie deficit for fat loss while supporting muscle with high protein. These macro targets total approximately ${t.targetKcal} calories.`
    : `Your maintenance level is ${t.maintenanceKcal} calories. A daily target of ${t.targetKcal} calories supports muscle with high protein. These macro targets total approximately ${t.targetKcal} calories.`;

  // Template protein lists, falling back to egg, dairy and plant proteins for
  // clients who don't eat meat or fish — a list must never come out empty, or
  // Gamma fills the gap back in with the template's (meat) wording.
  const priorityProteins = keepFoods([['chicken', ['chicken_breast', 'chicken_thigh']], ['beef', ['beef_mince_5', 'sirloin_steak']], ['fish', ['salmon', 'cod']], ['eggs', ['eggs']]], allowed);
  const otherProteins = keepFoods([['eggs', ['eggs']], ['egg whites', ['egg_whites']], ['Greek yoghurt', ['greek_yoghurt_0', 'greek_yoghurt_2']], ['cottage cheese', ['cottage_cheese']], ['lentils', ['red_lentils']], ['beans', ['black_beans', 'kidney_beans']], ['chickpeas', ['chickpeas']]], allowed);
  const foodPriorities = `Choose ${joinList(priorityProteins.length > 1 ? priorityProteins : Array.from(new Set([...priorityProteins, ...otherProteins])))} with ${joinList(keepFoods([['potatoes', ['potatoes']], ['sweet potatoes', ['sweet_potato']], ['fruit', []], ['vegetables such as peppers, courgette, tomatoes and carrots', []]], allowed))}. Use ${joinList(keepFoods([['butter', ['butter']], ['olive oil', ['olive_oil']], ['avocado', ['avocado']], ['nuts', ['walnuts', 'almonds']]], allowed))} for added fats.`;
  const templateProteins = keepFoods([['Quick-cooking steak', ['sirloin_steak']], ['Lean beef mince', ['beef_mince_5']], ['Chicken', ['chicken_breast']], ['Fish fillets', ['cod', 'salmon']], ['canned tuna', ['tuna_canned']]], allowed);
  const proteinBox = (templateProteins.length >= 2 ? templateProteins : [...templateProteins, ...otherProteins.map(cap)]).join(' · ');
  const fatsBox = ['Peppers, courgette, tomatoes, carrots', ...keepFoods([['Avocado', ['avocado']], ['Butter and olive oil', ['butter']], ['Walnuts or pumpkin seeds', ['walnuts', 'pumpkin_seeds']]], allowed)].join(' · ');

  const mealsCardTitle = `${cap(nWord)} Satisfying Meals`;
  const mealsCardText = n === 3
    ? 'Enjoy breakfast, lunch and dinner. Make each meal satisfying rather than relying on snacks. Breakfast is part of your daily structure; a small portion of chocolate can accompany a meal. It is Crucial to avoid snacking and focus on meals that keep you satisfied and full.'
    : 'Enjoy lunch and dinner. Make each meal satisfying rather than relying on snacks. A small portion of chocolate can accompany a meal. It is Crucial to avoid snacking and focus on meals that keep you satisfied and full.';

  const sections: string[] = [];
  sections.push(`## Card 1 — Cover (keep the layout, colours, logos and background image)
Heading: exactly "${COVER_HEADING}" — the template's heading word for word, with its colours. Do not add the client's name or anything else to it.
First paragraph: "Welcome to your personalised nutrition plan ${firstName}! Created by Vitality in partnership with IronBody Fit, this plan is built specifically for you, based on your individual measurements, goals, food preferences, health considerations, and lifestyle"
Second paragraph: unchanged.
Box "Your Goal": ${t.goalLabel}
Box "Your Approach": Structured calorie targets, high protein, whole foods, and ${nWord} satisfying meals.`);

  sections.push('## Card 2 — The Philosophy: keep exactly as the template, word for word.');

  sections.push(`## Card 3 — Your Personal Calorie and Macro Targets
Intro: "${targetsIntro}"
Stat "${t.targetKcal}" — Daily Calories — "${t.deficitApplied ? 'Daily fat-loss target: 300 calories below maintenance.' : 'Your daily calorie target.'}"
Stat "${t.protein}g" — Protein — "${t.protein}g daily to support muscle and keep meals satisfying."
Stat "${t.carbs}g" — Carbohydrates — "${t.carbs}g daily to fuel training and daily activity."
Stat "${t.fat}g" — Fat — "${t.fat}g daily from foods such as ${joinList(keepFoods([['eggs', ['eggs']], ['meat', ['chicken_breast', 'beef_mince_5']], ['avocado', ['avocado']], ['olive oil', ['olive_oil']]], allowed))}."
"Suggested Daily Meal Structure" — exactly ${n} arrow steps, no clock times:
${t.meals.map((m) => `- ${m.label}: "~${m.kcal} calories · ${MEAL_LINE[m.slot]}"`).join('\n')}`);

  if (n === 3) {
    sections.push(`## Card 4 — Breakfast Options — About ${kcalOf('breakfast')} kcal Each
Intro: "Four breakfasts at around ${kcalOf('breakfast')} kcal each for ${firstName}. All ingredient quantities are raw grams, and nutrition values are estimates.${note}"
Four recipe cards (same image-on-top layout as the template), replacing the template's breakfasts and their photos:
${bySlot('breakfast').map((r) => recipeCard(r, photo(r))).join('\n\n')}`);
  }

  sections.push(`## Card — Meal Examples — Lunch
Intro: "Lovely nutrient-dense lunches for ${firstName}, built around ${builtAround(bySlot('lunch'))}. Each option provides around ${kcalOf('lunch')} kcal. All ingredient quantities are raw grams; rice is weighed dry, and nutrition values are estimates.${n === 2 ? note : ''}"
Keep the template's aside box word for word ("These are examples and ideas for fun, varied meals…").
Four recipe cards, replacing the template's lunches and their photos:
${bySlot('lunch').map((r) => recipeCard(r, photo(r))).join('\n\n')}`);

  sections.push(`## Card — Meal Examples — Dinner (title this card "Meal Examples — Dinner")
Intro: "Dinner options provide around ${kcalOf('dinner')} kcal. All quantities are raw grams; rice is weighed dry and fruit without peel or cores. Nutrition values are estimates."
Four recipe cards, replacing the template's dinners and their photos:
${bySlot('dinner').map((r) => recipeCard(r, photo(r), 'Dinner — ')).join('\n\n')}`);

  sections.push(`## Card — Your Dietary Notes
Intro: "Build your ${nWord} meals around foods you enjoy, with plenty of protein,fruit and vegetables. Use these notes to keep everyday choices simple."
Box "Food Priorities": "${foodPriorities}"
Box "${mealsCardTitle}": "${mealsCardText}"
Box "Hydration": unchanged. Both coloured callouts below: unchanged, word for word.`);

  sections.push(`## Card — The 15-Minute Whole-Food System
Keep everything word for word, except these three boxes:
Box "Protein": "${proteinBox}"
Box "Carbohydrates": unchanged.
Box "Vegetables and Fats": "${fatsBox}"`);

  sections.push(`## Card — Your Roadmap
Keep everything word for word, except the "Weeks 3 to 4" step: "Keep the ${nWord} meals steady."`);

  sections.push('## Card — You Have Everything You Need: keep exactly as the template, word for word, including both buttons and links.');

  const prompt = `Create a personalised copy of this meal plan for ${p.fullName}.

STRICT RULES
- Keep the template's design, theme, layout, colours, fonts, logos, branding, icons, buttons and card order exactly as they are.
- The cover heading stays exactly "${COVER_HEADING}". The client's name appears only in the welcome sentence under it, never in the heading.
- Keep all wording exactly as the template unless it is written out below. Do not rephrase, shorten, summarise or add anything.
- Copy every number exactly as written below. Do not recalculate, round or change any calories, grams or macros.
- The plan has exactly ${n} meals: ${t.meals.map((m) => m.label).join(', ')}.${n === 2 ? ' Remove the template\'s breakfast card completely — no breakfast, optional breakfast or snack anywhere.' : ''}
- Do not add any meal times or clock times anywhere.
- Replace every recipe photo with the photo URL given for that recipe. Do not reuse the template's food photos and do not generate AI images.

CARD BY CARD
${sections.join('\n\n')}`;

  return { title: `${p.fullName} – Vitality x IronBody Fit Meal Plan`, prompt };
}

/** Checks the prompt says what the plan says — run before generating. */
export function checkGammaPrompt(prompt: string, p: GammaPlanInput): string[] {
  const problems: string[] = [];
  const must = [COVER_HEADING, p.firstName, String(p.targets.targetKcal), String(p.targets.maintenanceKcal), `${p.targets.protein}g`, `${p.targets.carbs}g`, `${p.targets.fat}g`, 'VITALITY', 'IronBody Fit'];
  for (const s of must) if (!prompt.includes(s)) problems.push(`Gamma prompt is missing "${s}".`);
  for (const r of p.recipes) {
    if (!prompt.includes(r.name)) problems.push(`Gamma prompt is missing the recipe "${r.name}".`);
    if (!prompt.includes(`${r.fit.nutrition.display.kcal} kcal`)) problems.push(`Gamma prompt is missing the calories for "${r.name}".`);
  }
  if (/\b(13:00|18:00)\b/.test(prompt)) problems.push('Gamma prompt contains a template meal time.');
  if (/: ""|Choose\s+with\b|such as \./.test(prompt)) problems.push('Gamma prompt has an empty list — Gamma would fill it with template wording.');
  return problems;
}
