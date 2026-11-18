// Daily calorie and macro targets for the automated IronBody Fit meal plans.
// Pure, deterministic code — the language model never produces these numbers.
//
// Rules (agreed with the coach, Oct 2026):
//   BMR   Mifflin-St Jeor from age, sex, height, weight
//   TDEE  BMR × activity: 0 sessions 1.2, otherwise 1.375 (capped, Nov 2026)
//   Target = maintenance − 400 kcal, rounded to the nearest 50 (coach, Nov 2026:
//   400 rather than 300 so the deficit is real even if activity is overstated)
//   Protein 0.7 g/lb, fat 0.5 g/lb, carbs = the remaining calories
//   No deficit (target = maintenance) and a coach flag for underweight and
//   under-18s. A declared medical condition is flagged for the coach, and only
//   removes the deficit when the client's goal isn't fat loss.
// The finished plan only shows maintenance and the target — never BMR,
// TDEE, BMI, age, height or weight.

export const CALC_VERSION = 'targets-v1';

const LB_PER_KG = 2.20462;
export const DEFICIT = 400;

export type Sex = 'Male' | 'Female';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export type TargetsInput = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  /** Exercise sessions per week; null when the form didn't ask (older submissions) */
  sessionsPerWeek: number | null;
  mealsPerDay: 2 | 3;
  /** "When are you most hungry?" answer, used to make that meal the larger one */
  hungriest?: string | null;
  hasMedicalCondition: boolean;
  takesMedication: boolean;
  /** The form's goal includes losing fat — they always get the deficit (except underweight / under 18) */
  fatLossGoal?: boolean;
};

export type FlagCode =
  | 'activity_unknown' | 'underweight' | 'under_18' | 'medical_condition' | 'medication'
  | 'low_carbs' | 'very_low_calories' | 'macro_mismatch'
  | 'meal_count' | 'check_exclusions' | 'recipe' | 'photo';

export type Flag = { code: FlagCode; message: string; /** blocks the deficit (target = maintenance) */ noDeficit?: boolean };

export type MealTarget = { slot: MealSlot; label: string; kcal: number; protein: number };

export type Targets = {
  calcVersion: string;
  goalLabel: string;
  activityLabel: string;
  /** shown in the plan */
  maintenanceKcal: number;
  /** shown in the plan */
  targetKcal: number;
  deficitApplied: boolean;
  protein: number;
  fat: number;
  carbs: number;
  meals: MealTarget[];
  flags: Flag[];
  /** internal working, kept for the audit trail — never printed in the plan */
  working: { bmr: number; multiplier: number; tdee: number; bmi: number; weightLb: number; macroKcal: number };
};

export const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export function bmrMifflin(sex: Sex, age: number, heightCm: number, weightKg: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'Male' ? 5 : -161);
}

export function activityFor(sessions: number | null): { multiplier: number; label: string } {
  if (sessions === null) return { multiplier: 1.375, label: 'Lightly active (assumed — not asked)' };
  if (sessions <= 0) return { multiplier: 1.2, label: 'Sedentary' };
  // Capped at lightly active (coach, Nov 2026): people overstate their
  // training, and 1.55/1.725 put fat-loss targets too high.
  return { multiplier: 1.375, label: sessions <= 2 ? 'Lightly active' : 'Lightly active (capped — trains more often)' };
}

export function goalLabelFor(sex: Sex): string {
  return sex === 'Male' ? 'Lose body fat and build muscle' : 'Lose fat and tone muscle';
}

// Share of the day's calories per meal. The meal the client is hungriest
// for gets the bigger share; dinner is the default biggest meal.
function mealShares(mealsPerDay: 2 | 3, hungriest?: string | null): { slot: MealSlot; share: number }[] {
  const h = (hungriest ?? '').toLowerCase();
  if (mealsPerDay === 2) {
    const lunchBigger = h === 'morning' || h === 'midday';
    return [{ slot: 'lunch', share: lunchBigger ? 0.55 : 0.45 }, { slot: 'dinner', share: lunchBigger ? 0.45 : 0.55 }];
  }
  if (h === 'morning') return [{ slot: 'breakfast', share: 0.35 }, { slot: 'lunch', share: 0.3 }, { slot: 'dinner', share: 0.35 }];
  if (h === 'midday') return [{ slot: 'breakfast', share: 0.25 }, { slot: 'lunch', share: 0.4 }, { slot: 'dinner', share: 0.35 }];
  return [{ slot: 'breakfast', share: 0.25 }, { slot: 'lunch', share: 0.35 }, { slot: 'dinner', share: 0.4 }];
}

const MEAL_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

/** Splits the day across meals; meal calories are rounded to 10 and always add back up to the daily target. */
export function splitMeals(targetKcal: number, protein: number, mealsPerDay: 2 | 3, hungriest?: string | null): MealTarget[] {
  const shares = mealShares(mealsPerDay, hungriest);
  const meals = shares.map(({ slot, share }) => ({ slot, label: MEAL_LABEL[slot], kcal: roundTo(targetKcal * share, 10), protein: Math.round(protein * share) }));
  // Rounding drift goes onto the largest meal.
  const largest = meals.reduce((a, b) => (b.kcal > a.kcal ? b : a));
  largest.kcal += targetKcal - meals.reduce((s, m) => s + m.kcal, 0);
  largest.protein += protein - meals.reduce((s, m) => s + m.protein, 0);
  return meals;
}

export function calculateTargets(input: TargetsInput): Targets {
  const flags: Flag[] = [];
  const { sex, age, heightCm, weightKg } = input;

  const bmr = bmrMifflin(sex, age, heightCm, weightKg);
  const { multiplier, label: activityLabel } = activityFor(input.sessionsPerWeek);
  const tdee = bmr * multiplier;
  const bmi = weightKg / (heightCm / 100) ** 2;
  const weightLb = weightKg * LB_PER_KG;

  if (input.sessionsPerWeek === null) flags.push({ code: 'activity_unknown', message: 'The form did not ask how often they exercise — calories assume lightly active (1–2 sessions a week). Check with the client.' });
  if (bmi < 18.5) flags.push({ code: 'underweight', message: 'Underweight for their height — no calorie deficit applied. Coach review needed.', noDeficit: true });
  if (age < 18) flags.push({ code: 'under_18', message: 'Under 18 — no calorie deficit applied. Coach review needed.', noDeficit: true });
  if (input.hasMedicalCondition) {
    flags.push(input.fatLossGoal
      ? { code: 'medical_condition', message: `Declared a medical condition that may affect their diet — the ${DEFICIT} kcal deficit is still applied because their goal is fat loss. Read their answer before sending.` }
      : { code: 'medical_condition', message: 'Declared a medical condition that may affect their diet — no calorie deficit applied. Read their answer before sending.', noDeficit: true });
  }
  if (input.takesMedication) flags.push({ code: 'medication', message: 'Takes medication — check their answer before sending.' });

  const maintenanceKcal = roundTo(tdee, 50);
  const deficitApplied = !flags.some((f) => f.noDeficit);
  const targetKcal = deficitApplied ? maintenanceKcal - DEFICIT : maintenanceKcal;

  const protein = Math.round(0.7 * weightLb);
  const fat = Math.round(0.5 * weightLb);
  const carbs = Math.max(0, Math.round((targetKcal - protein * 4 - fat * 9) / 4));
  const macroKcal = protein * 4 + carbs * 4 + fat * 9;

  if (carbs < 100) flags.push({ code: 'low_carbs', message: `Protein and fat leave only ${carbs} g of carbohydrate a day — likely impractical. Coach review needed.` });
  if (targetKcal < (sex === 'Male' ? 1500 : 1200)) flags.push({ code: 'very_low_calories', message: `Target of ${targetKcal} kcal is very low. Coach review needed.` });
  // Whole-gram rounding is at most ~10 kcal out; anything more means the rules can't be met.
  if (Math.abs(macroKcal - targetKcal) > 20) flags.push({ code: 'macro_mismatch', message: `Macros add up to ${macroKcal} kcal, not the ${targetKcal} kcal target.` });

  return {
    calcVersion: CALC_VERSION,
    goalLabel: goalLabelFor(sex),
    activityLabel,
    maintenanceKcal,
    targetKcal,
    deficitApplied,
    protein,
    fat,
    carbs,
    meals: splitMeals(targetKcal, protein, input.mealsPerDay, input.hungriest),
    flags,
    working: { bmr: Math.round(bmr), multiplier, tdee: Math.round(tdee), bmi: Math.round(bmi * 10) / 10, weightLb: Math.round(weightLb * 10) / 10, macroKcal },
  };
}
