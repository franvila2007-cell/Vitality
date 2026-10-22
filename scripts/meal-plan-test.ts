// Tests for the meal-plan calculation engine: npx tsx scripts/meal-plan-test.ts
import { bmrMifflin, activityFor, calculateTargets, splitMeals, type TargetsInput } from '../src/lib/mealPlan/targets';
import { recipeNutrition, fitPortions, INGREDIENT_BY_ID, KCAL_TOLERANCE } from '../src/lib/mealPlan/nutrition';
import { INGREDIENTS } from '../src/lib/mealPlan/ingredients.data';

let fail = 0;
function check(name: string, ok: boolean, extra = '') { if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); }
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;
const base: TargetsInput = { sex: 'Male', age: 30, heightCm: 180, weightKg: 90, sessionsPerWeek: 4, mealsPerDay: 2, hasMedicalCondition: false, takesMedication: false };

// ── BMR / activity ───────────────────────────────────────────────────────
check('BMR male 90kg 180cm 30y = 1880', bmrMifflin('Male', 30, 180, 90) === 1880);
check('BMR female 60kg 165cm 35y = 1295.25', bmrMifflin('Female', 35, 165, 60) === 1295.25);
check('0 sessions → 1.2', activityFor(0).multiplier === 1.2);
check('1–2 sessions → 1.375', activityFor(1).multiplier === 1.375 && activityFor(2).multiplier === 1.375);
check('3–5 sessions → 1.55', activityFor(3).multiplier === 1.55 && activityFor(5).multiplier === 1.55);
check('6–7 sessions → 1.725', activityFor(6).multiplier === 1.725 && activityFor(7).multiplier === 1.725);

// ── Standard male: 1880 × 1.55 = 2914 → 2900 maintenance, 2600 target ────
const m = calculateTargets(base);
check('maintenance 2900', m.maintenanceKcal === 2900, String(m.maintenanceKcal));
check('target 2600 (300 below)', m.targetKcal === 2600 && m.deficitApplied);
check('protein 0.7 g/lb = 139 g', m.protein === 139, String(m.protein));
check('fat 0.5 g/lb = 99 g', m.fat === 99, String(m.fat));
check('carbs = remainder = 288 g', m.carbs === 288, String(m.carbs));
check('macros add up to target ±10 kcal', Math.abs(m.working.macroKcal - m.targetKcal) <= 10, String(m.working.macroKcal));
check('male goal label', m.goalLabel === 'Lose body fat and build muscle');
check('no flags', m.flags.length === 0, JSON.stringify(m.flags));
check('2 meals: lunch + dinner only', m.meals.map((x) => x.slot).join() === 'lunch,dinner');
check('meal kcal sum to target', m.meals.reduce((s, x) => s + x.kcal, 0) === m.targetKcal);
check('meal protein sums to daily', m.meals.reduce((s, x) => s + x.protein, 0) === m.protein);
check('dinner is the bigger meal by default', m.meals[1].kcal > m.meals[0].kcal);

// ── Woman, sedentary: carbs come out low and get flagged, not changed ────
const f = calculateTargets({ ...base, sex: 'Female', age: 35, heightCm: 165, weightKg: 60, sessionsPerWeek: 0, mealsPerDay: 3 });
check('female maintenance 1550', f.maintenanceKcal === 1550, String(f.maintenanceKcal));
check('female target 1250', f.targetKcal === 1250);
check('female goal label', f.goalLabel === 'Lose fat and tone muscle');
check('female carbs 71 g flagged low', f.carbs === 71 && f.flags.some((x) => x.code === 'low_carbs'), String(f.carbs));
check('3 meals: breakfast, lunch, dinner', f.meals.map((x) => x.slot).join() === 'breakfast,lunch,dinner');

// ── Safety: no deficit ───────────────────────────────────────────────────
const uw = calculateTargets({ ...base, weightKg: 55 });
check('underweight → no deficit', !uw.deficitApplied && uw.targetKcal === uw.maintenanceKcal && uw.flags.some((x) => x.code === 'underweight'));
const minor = calculateTargets({ ...base, age: 16 });
check('under 18 → no deficit', !minor.deficitApplied && minor.flags.some((x) => x.code === 'under_18'));
const med = calculateTargets({ ...base, hasMedicalCondition: true });
check('medical condition → no deficit', !med.deficitApplied && med.flags.some((x) => x.code === 'medical_condition'));
const pills = calculateTargets({ ...base, takesMedication: true });
check('medication only → deficit kept, flagged', pills.deficitApplied && pills.flags.some((x) => x.code === 'medication'));
const unknown = calculateTargets({ ...base, sessionsPerWeek: null });
check('activity not asked → flagged, 1.375 used', unknown.working.multiplier === 1.375 && unknown.flags.some((x) => x.code === 'activity_unknown'));

// ── Heavy client: 0.7/0.5 g/lb leaves too few carbs → flagged ────────────
const heavy = calculateTargets({ ...base, weightKg: 130, age: 40, sessionsPerWeek: 0 });
check('130 kg sedentary: target 2400', heavy.targetKcal === 2400, String(heavy.targetKcal));
check('130 kg: low carbs flagged', heavy.carbs < 100 && heavy.flags.some((x) => x.code === 'low_carbs'), String(heavy.carbs));

// ── Hungriest meal gets the bigger share ─────────────────────────────────
const lunchBig = splitMeals(2000, 140, 2, 'Midday');
check('hungry at midday → lunch bigger', lunchBig[0].kcal > lunchBig[1].kcal);
const odd = splitMeals(2350, 133, 3, null);
check('3-meal split sums exactly', odd.reduce((s, x) => s + x.kcal, 0) === 2350 && odd.reduce((s, x) => s + x.protein, 0) === 133);

// ── Ingredient library integrity ─────────────────────────────────────────
check('150 ingredients', INGREDIENTS.length === 150, String(INGREDIENTS.length));
check('unique ids', new Set(INGREDIENTS.map((i) => i.id)).size === INGREDIENTS.length);
check('every ingredient has a USDA fdc_id', INGREDIENTS.every((i) => i.fdcId > 100000 && i.usdaDescription.length > 0));
check('portion ranges sane', INGREDIENTS.every((i) => i.minG >= 0 && i.minG <= i.maxG));
check('macros ≤ 100 g per 100 g', INGREDIENTS.every((i) => i.per100g.protein + i.per100g.carbs + i.per100g.fat <= 100.5));
check('no seed oils / sweeteners / protein powder', !INGREDIENTS.some((i) => /sunflower|soybean oil|canola|rapeseed|vegetable oil|sucralose|aspartame|stevia|whey|protein powder|margarine/i.test(i.name + i.usdaDescription)));
check('olive oil is labelled raw-only', /raw/.test(INGREDIENT_BY_ID.get('olive_oil')!.name));

// ── Recipe nutrition from USDA values ────────────────────────────────────
const chicken = recipeNutrition([{ ingredientId: 'chicken_breast', grams: 200, role: 'protein' }]);
check('200 g chicken breast: 45 g protein', near(chicken.exact.protein, 45));
check('200 g chicken breast: 227 kcal (4/4/9)', near(chicken.exact.kcal, 227.16));
check('display rounds kcal to 5', chicken.display.kcal === 225);
check('items keep their fdc_id', chicken.items[0].fdcId === 171077);
const withButter = recipeNutrition([{ ingredientId: 'chicken_breast', grams: 200, role: 'protein' }, { ingredientId: 'butter', grams: 10, role: 'fixed' }]);
check('cooking fat is counted', withButter.exact.kcal - chicken.exact.kcal > 70);

// ── Portion fitting ──────────────────────────────────────────────────────
const proposed = [
  { ingredientId: 'chicken_breast', grams: 200, role: 'protein' as const },
  { ingredientId: 'potatoes', grams: 250, role: 'carb' as const },
  { ingredientId: 'courgette', grams: 150, role: 'fixed' as const },
  { ingredientId: 'butter', grams: 10, role: 'fixed' as const },
  { ingredientId: 'olive_oil', grams: 5, role: 'fixed' as const },
];
// 1170 kcal from chicken + potatoes would need >500 g potatoes: reported, not faked.
const potatoBig = fitPortions(proposed, { kcal: 1170, protein: 70 });
check('chicken + potato can\'t reach 1170 → not ok', !potatoBig.ok && potatoBig.notes.some((n) => n.includes('potatoes')), potatoBig.notes.join('; '));
const fit = fitPortions(proposed, { kcal: 780, protein: 60 });
check('fit lands within ±7.5% of 780 kcal', fit.ok, `${Math.round(fit.nutrition.exact.kcal)} kcal`);
check('fit protein within ±15%', Math.abs(fit.proteinOffPct) <= 0.15, `${Math.round(fit.nutrition.exact.protein)} g`);
const rice = fitPortions([
  { ingredientId: 'beef_mince_5', grams: 200, role: 'protein' },
  { ingredientId: 'white_rice', grams: 100, role: 'carb' },
  { ingredientId: 'red_pepper', grams: 150, role: 'fixed' },
  { ingredientId: 'avocado', grams: 80, role: 'fixed' },
  { ingredientId: 'ghee', grams: 10, role: 'fixed' },
], { kcal: 1170, protein: 70 });
check('beef + rice reaches 1170 kcal', rice.ok, `${Math.round(rice.nutrition.exact.kcal)} kcal, ${Math.round(rice.nutrition.exact.protein)} g P`);
check('beef + rice protein within ±15%', Math.abs(rice.proteinOffPct) <= 0.15);
check('fit grams rounded to 5', fit.items.every((i) => i.grams % 5 === 0));
check('fit keeps quantities in range', fit.items.every((i) => i.grams >= INGREDIENT_BY_ID.get(i.ingredientId)!.minG && i.grams <= INGREDIENT_BY_ID.get(i.ingredientId)!.maxG));
check('fixed ingredients untouched', fit.items.find((i) => i.ingredientId === 'butter')!.grams === 10);
check('original order kept', fit.items.map((i) => i.ingredientId).join() === proposed.map((i) => i.ingredientId).join());

const small = fitPortions(proposed, { kcal: 450, protein: 35 });
check('small meal also fits', small.ok, `${Math.round(small.nutrition.exact.kcal)} kcal`);

// Eggs-only breakfast (no carb group): scales the eggs for calories.
const eggs = fitPortions([{ ingredientId: 'eggs', grams: 150, role: 'protein' }, { ingredientId: 'avocado', grams: 60, role: 'fixed' }, { ingredientId: 'butter', grams: 5, role: 'fixed' }], { kcal: 400, protein: 25 });
check('protein-only recipe fits calories', eggs.ok, `${Math.round(eggs.nutrition.exact.kcal)} kcal`);

// Impossible target: reports it instead of inventing quantities.
const tooBig = fitPortions([{ ingredientId: 'cod', grams: 150, role: 'protein' }, { ingredientId: 'spinach', grams: 50, role: 'fixed' }], { kcal: 1500, protein: 60 });
check('impossible target flagged not faked', !tooBig.ok && tooBig.items[0].grams <= 400 && tooBig.notes.length > 0, tooBig.notes.join('; '));
check('tolerance is ±7.5%', KCAL_TOLERANCE === 0.075);

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
