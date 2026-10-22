// Shapes for the meal-plan ingredient library (ingredients.data.ts, generated
// from USDA FoodData Central by scripts/build-meal-plan-ingredients.ts).

export type IngredientCategory = 'protein' | 'dairy' | 'carb' | 'veg' | 'fruit' | 'fat' | 'flavour';

/** What the quantity in a recipe refers to: weighed raw, dry (rice, pasta, oats), drained from a tin, or ready to eat. */
export type IngredientState = 'raw' | 'dry' | 'canned_drained' | 'ready';

/** Allergen and diet tags used to exclude ingredients from a client's plan. */
export type IngredientTag =
  | 'gluten' | 'dairy' | 'egg' | 'fish' | 'shellfish' | 'mollusc' | 'seafood'
  | 'tree_nut' | 'peanut' | 'sesame' | 'soy' | 'mustard' | 'celery' | 'legume'
  | 'meat' | 'red_meat' | 'poultry' | 'pork';

export type Ingredient = {
  id: string;
  /** Name as printed in a recipe */
  name: string;
  category: IngredientCategory;
  state: IngredientState;
  tags: IngredientTag[];
  /** Realistic portion range for one meal, in grams */
  minG: number;
  maxG: number;
  /** Words a client might use for it ("prawns", "shrimp") — for matching likes and dislikes */
  aliases: string[];
  fdcId: number;
  usdaDescription: string;
  per100g: { protein: number; carbs: number; fat: number; fibre: number; usdaKcal: number };
};
