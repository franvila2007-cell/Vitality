// Micronutrient tracking: Vitto estimates these per logged food (see
// llmEstimateFoodInsights in vitto/llmFallback.ts) from the food's name and
// portion alone — there's no nutrition label to read, so treat these as
// directionally useful estimates, not lab-measured values. %DV reference
// values below are the standard FDA adult daily values used on US
// nutrition labels (21 CFR 101.9), not personalized to any one client.
export type MicronutrientKey =
  | 'fiber_g' | 'sugar_g' | 'sodium_mg'
  | 'calcium_mg' | 'iron_mg' | 'potassium_mg' | 'magnesium_mg' | 'zinc_mg'
  | 'vitamin_a_mcg' | 'vitamin_c_mg' | 'vitamin_d_mcg' | 'vitamin_e_mg' | 'vitamin_k_mcg'
  | 'vitamin_b6_mg' | 'vitamin_b12_mcg' | 'folate_mcg';

export type MicronutrientTotals = Record<MicronutrientKey, number>;

type MicronutrientMeta = { label: string; unit: string; dailyValue: number; group: 'Everyday' | 'Minerals' | 'Vitamins' };

export const MICRONUTRIENTS: Record<MicronutrientKey, MicronutrientMeta> = {
  fiber_g: { label: 'Fiber', unit: 'g', dailyValue: 28, group: 'Everyday' },
  sugar_g: { label: 'Sugar', unit: 'g', dailyValue: 50, group: 'Everyday' },
  sodium_mg: { label: 'Sodium', unit: 'mg', dailyValue: 2300, group: 'Everyday' },
  calcium_mg: { label: 'Calcium', unit: 'mg', dailyValue: 1300, group: 'Minerals' },
  iron_mg: { label: 'Iron', unit: 'mg', dailyValue: 18, group: 'Minerals' },
  potassium_mg: { label: 'Potassium', unit: 'mg', dailyValue: 4700, group: 'Minerals' },
  magnesium_mg: { label: 'Magnesium', unit: 'mg', dailyValue: 420, group: 'Minerals' },
  zinc_mg: { label: 'Zinc', unit: 'mg', dailyValue: 11, group: 'Minerals' },
  vitamin_a_mcg: { label: 'Vitamin A', unit: 'mcg', dailyValue: 900, group: 'Vitamins' },
  vitamin_c_mg: { label: 'Vitamin C', unit: 'mg', dailyValue: 90, group: 'Vitamins' },
  vitamin_d_mcg: { label: 'Vitamin D', unit: 'mcg', dailyValue: 20, group: 'Vitamins' },
  vitamin_e_mg: { label: 'Vitamin E', unit: 'mg', dailyValue: 15, group: 'Vitamins' },
  vitamin_k_mcg: { label: 'Vitamin K', unit: 'mcg', dailyValue: 120, group: 'Vitamins' },
  vitamin_b6_mg: { label: 'Vitamin B6', unit: 'mg', dailyValue: 1.7, group: 'Vitamins' },
  vitamin_b12_mcg: { label: 'Vitamin B12', unit: 'mcg', dailyValue: 2.4, group: 'Vitamins' },
  folate_mcg: { label: 'Folate', unit: 'mcg', dailyValue: 400, group: 'Vitamins' },
};

export const MICRONUTRIENT_KEYS = Object.keys(MICRONUTRIENTS) as MicronutrientKey[];

export function computeMicroTotals(meals: Partial<Record<MicronutrientKey, number | null>>[]): MicronutrientTotals {
  const totals = Object.fromEntries(MICRONUTRIENT_KEYS.map((k) => [k, 0])) as MicronutrientTotals;
  for (const meal of meals) {
    for (const key of MICRONUTRIENT_KEYS) {
      totals[key] += meal[key] ?? 0;
    }
  }
  return totals;
}
