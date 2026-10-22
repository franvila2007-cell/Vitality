// Builds src/lib/mealPlan/ingredients.data.ts — the ingredient library the
// automated IronBody Fit meal plans are calculated from — out of USDA
// FoodData Central's SR Legacy release, so every number traces back to a
// USDA fdc_id instead of being typed in (or guessed by a model).
//
//   1. Download + unzip https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
//   2. npx tsx scripts/build-meal-plan-ingredients.ts <path to the unzipped folder>
//
// Only ingredients listed in SPEC are included. Seed oils, sweeteners,
// protein powders and ultra-processed foods are left out on purpose, so a
// recipe simply can't use them. To add an ingredient: find its fdc_id in
// food.csv, add a SPEC row, re-run, and review the diff.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IngredientCategory, IngredientState, IngredientTag } from '../src/lib/mealPlan/ingredientTypes';

type Spec = [
  id: string, fdcId: number, name: string, category: IngredientCategory, state: IngredientState,
  tags: IngredientTag[], minG: number, maxG: number, aliases?: string[],
];

const SPEC: Spec[] = [
  // ── Protein ────────────────────────────────────────────────────────────
  ['chicken_breast', 171077, 'chicken breast', 'protein', 'raw', ['poultry', 'meat'], 100, 350, ['chicken']],
  ['chicken_thigh', 173627, 'boneless skinless chicken thighs', 'protein', 'raw', ['poultry', 'meat'], 100, 350, ['chicken', 'chicken thigh']],
  ['chicken_drumstick', 173614, 'chicken drumsticks (meat only)', 'protein', 'raw', ['poultry', 'meat'], 100, 350, ['chicken', 'drumstick']],
  ['turkey_mince', 171505, 'turkey mince', 'protein', 'raw', ['poultry', 'meat'], 100, 350, ['turkey', 'ground turkey']],
  ['beef_mince_5', 171790, '5% fat beef mince', 'protein', 'raw', ['red_meat', 'meat'], 100, 350, ['beef', 'mince', 'ground beef', 'minced beef']],
  ['beef_mince_10', 174030, '10% fat beef mince', 'protein', 'raw', ['red_meat', 'meat'], 100, 300, ['beef', 'mince', 'ground beef', 'minced beef']],
  ['sirloin_steak', 174055, 'sirloin steak (trimmed)', 'protein', 'raw', ['red_meat', 'meat'], 80, 350, ['beef', 'steak', 'sirloin']],
  ['ribeye_steak', 170839, 'ribeye steak (trimmed)', 'protein', 'raw', ['red_meat', 'meat'], 120, 300, ['beef', 'steak', 'ribeye', 'rib eye']],
  ['flank_steak', 174776, 'flank steak', 'protein', 'raw', ['red_meat', 'meat'], 80, 350, ['beef', 'steak', 'flank']],
  ['pork_tenderloin', 168249, 'pork tenderloin', 'protein', 'raw', ['pork', 'red_meat', 'meat'], 120, 350, ['pork']],
  ['pork_loin_chop', 168263, 'boneless pork loin chop', 'protein', 'raw', ['pork', 'red_meat', 'meat'], 120, 350, ['pork', 'pork chop']],
  ['lamb_leg', 172576, 'lean lamb leg', 'protein', 'raw', ['red_meat', 'meat'], 120, 300, ['lamb']],
  ['salmon', 175167, 'salmon fillet', 'protein', 'raw', ['fish', 'seafood'], 100, 300, ['salmon', 'fish']],
  ['smoked_salmon', 173687, 'smoked salmon', 'protein', 'ready', ['fish', 'seafood'], 50, 200, ['salmon', 'fish', 'lox']],
  ['cod', 171955, 'cod fillet', 'protein', 'raw', ['fish', 'seafood'], 120, 400, ['cod', 'white fish', 'fish']],
  ['haddock', 171964, 'haddock fillet', 'protein', 'raw', ['fish', 'seafood'], 120, 400, ['haddock', 'white fish', 'fish']],
  ['sea_bass', 175142, 'sea bass fillet', 'protein', 'raw', ['fish', 'seafood'], 120, 400, ['sea bass', 'bass', 'white fish', 'fish']],
  ['tilapia', 175176, 'tilapia fillet', 'protein', 'raw', ['fish', 'seafood'], 120, 400, ['tilapia', 'white fish', 'fish']],
  ['trout', 173717, 'rainbow trout fillet', 'protein', 'raw', ['fish', 'seafood'], 120, 350, ['trout', 'fish']],
  ['mackerel', 175119, 'mackerel fillet', 'protein', 'raw', ['fish', 'seafood'], 100, 250, ['mackerel', 'fish']],
  ['tuna_steak', 175159, 'fresh tuna steak', 'protein', 'raw', ['fish', 'seafood'], 120, 350, ['tuna', 'fish']],
  ['tuna_canned', 173709, 'tinned tuna in water (drained)', 'protein', 'canned_drained', ['fish', 'seafood'], 80, 300, ['tuna', 'tinned tuna', 'canned tuna', 'fish']],
  ['sardines_canned', 175139, 'tinned sardines in olive oil (drained)', 'protein', 'canned_drained', ['fish', 'seafood'], 60, 200, ['sardines', 'sardine', 'fish']],
  ['prawns', 175179, 'peeled prawns', 'protein', 'raw', ['shellfish', 'seafood'], 120, 400, ['prawn', 'prawns', 'shrimp', 'shrimps']],
  ['squid', 174223, 'squid', 'protein', 'raw', ['mollusc', 'seafood'], 120, 400, ['squid', 'calamari']],
  ['octopus', 174218, 'octopus', 'protein', 'raw', ['mollusc', 'seafood'], 120, 400, ['octopus', 'qarnita']],
  ['eggs', 171287, 'eggs', 'protein', 'raw', ['egg'], 50, 250, ['egg', 'eggs']],
  ['egg_whites', 172183, 'egg whites', 'protein', 'raw', ['egg'], 60, 250, ['egg', 'egg white', 'egg whites']],

  // ── Dairy ──────────────────────────────────────────────────────────────
  ['greek_yoghurt_0', 170894, 'plain 0% Greek yoghurt', 'dairy', 'ready', ['dairy'], 100, 350, ['yoghurt', 'yogurt', 'greek yoghurt', 'greek yogurt']],
  ['greek_yoghurt_2', 170903, 'plain 2% Greek yoghurt', 'dairy', 'ready', ['dairy'], 100, 350, ['yoghurt', 'yogurt', 'greek yoghurt', 'greek yogurt']],
  ['greek_yoghurt_full', 171304, 'plain full-fat Greek yoghurt', 'dairy', 'ready', ['dairy'], 100, 300, ['yoghurt', 'yogurt', 'greek yoghurt', 'greek yogurt']],
  ['cottage_cheese', 172182, 'low-fat (2%) cottage cheese', 'dairy', 'ready', ['dairy'], 100, 300, ['cottage cheese', 'cheese']],
  ['ricotta', 171248, 'part-skim ricotta (irkotta)', 'dairy', 'ready', ['dairy'], 50, 250, ['ricotta', 'irkotta', 'cheese']],
  ['feta', 173420, 'feta cheese', 'dairy', 'ready', ['dairy'], 15, 60, ['feta', 'cheese']],
  ['mozzarella', 170847, 'mozzarella', 'dairy', 'ready', ['dairy'], 20, 100, ['mozzarella', 'cheese']],
  ['parmesan', 170848, 'parmesan', 'dairy', 'ready', ['dairy'], 5, 30, ['parmesan', 'parmigiano', 'cheese']],
  ['cheddar', 173414, 'cheddar', 'dairy', 'ready', ['dairy'], 15, 50, ['cheddar', 'cheese']],
  ['goats_cheese', 173435, 'soft goat\'s cheese', 'dairy', 'ready', ['dairy'], 15, 60, ['goat cheese', 'goats cheese', 'cheese']],
  ['milk_whole', 171265, 'whole milk', 'dairy', 'ready', ['dairy'], 50, 400, ['milk']],
  ['milk_semi', 171267, 'semi-skimmed milk', 'dairy', 'ready', ['dairy'], 50, 400, ['milk']],
  ['kefir', 170904, 'plain kefir', 'dairy', 'ready', ['dairy'], 100, 400, ['kefir']],

  // ── Carbohydrates (weighed raw / dry) ──────────────────────────────────
  ['potatoes', 170026, 'potatoes', 'carb', 'raw', [], 100, 500, ['potato', 'potatoes']],
  ['sweet_potato', 168482, 'sweet potato', 'carb', 'raw', [], 100, 500, ['sweet potato', 'sweet potatoes']],
  ['white_rice', 168877, 'white rice (dry)', 'carb', 'dry', [], 30, 150, ['rice', 'white rice', 'basmati']],
  ['brown_rice', 169703, 'brown rice (dry)', 'carb', 'dry', [], 30, 150, ['rice', 'brown rice']],
  ['pasta', 169736, 'pasta (dry)', 'carb', 'dry', ['gluten'], 40, 150, ['pasta', 'spaghetti', 'penne', 'wheat']],
  ['wholewheat_pasta', 169738, 'wholewheat pasta (dry)', 'carb', 'dry', ['gluten'], 40, 150, ['pasta', 'wholewheat pasta', 'wheat']],
  ['rice_noodles', 169742, 'rice noodles (dry)', 'carb', 'dry', [], 40, 130, ['noodles', 'rice noodles']],
  ['oats', 169705, 'rolled oats', 'carb', 'dry', ['gluten'], 30, 100, ['oats', 'porridge', 'oatmeal']],
  ['quinoa', 168874, 'quinoa (dry)', 'carb', 'dry', [], 30, 120, ['quinoa']],
  ['couscous', 169699, 'couscous (dry)', 'carb', 'dry', ['gluten'], 30, 120, ['couscous', 'wheat']],
  ['bulgur', 170688, 'bulgur wheat (dry)', 'carb', 'dry', ['gluten'], 30, 120, ['bulgur', 'wheat']],
  ['sourdough', 172675, 'sourdough bread', 'carb', 'ready', ['gluten'], 30, 150, ['bread', 'sourdough', 'wheat', 'hobz']],
  ['wholemeal_bread', 172688, 'wholemeal bread', 'carb', 'ready', ['gluten'], 30, 150, ['bread', 'wholemeal bread', 'brown bread', 'wheat']],
  ['pitta', 174915, 'white pitta bread', 'carb', 'ready', ['gluten'], 40, 130, ['bread', 'pitta', 'pita', 'wheat']],
  ['corn_tortilla', 175036, 'corn tortillas', 'carb', 'ready', [], 25, 120, ['tortilla', 'tortillas']],
  ['rye_crispbread', 172744, 'rye crispbread', 'carb', 'ready', ['gluten'], 10, 60, ['crispbread', 'rye']],
  ['rice_cakes', 170250, 'plain rice cakes', 'carb', 'ready', [], 9, 50, ['rice cakes', 'rice cake']],
  ['chickpeas', 173801, 'tinned chickpeas (drained)', 'carb', 'canned_drained', ['legume'], 60, 250, ['chickpeas', 'chickpea', 'garbanzo']],
  ['kidney_beans', 173741, 'tinned kidney beans', 'carb', 'canned_drained', ['legume'], 60, 250, ['beans', 'kidney beans']],
  ['black_beans', 175238, 'tinned black beans', 'carb', 'canned_drained', ['legume'], 60, 250, ['beans', 'black beans']],
  ['red_lentils', 174284, 'red lentils (dry)', 'carb', 'dry', ['legume'], 30, 120, ['lentils', 'lentil', 'red lentils']],

  // ── Vegetables ─────────────────────────────────────────────────────────
  ['red_pepper', 170108, 'red peppers', 'veg', 'raw', [], 30, 300, ['pepper', 'peppers', 'bell pepper']],
  ['green_pepper', 170427, 'green peppers', 'veg', 'raw', [], 30, 300, ['pepper', 'peppers', 'bell pepper']],
  ['courgette', 169291, 'courgette', 'veg', 'raw', [], 30, 300, ['courgette', 'zucchini', 'qarabali']],
  ['tomatoes', 170457, 'tomatoes', 'veg', 'raw', [], 30, 300, ['tomato', 'tomatoes']],
  ['cucumber', 168409, 'cucumber', 'veg', 'raw', [], 30, 300, ['cucumber']],
  ['carrots', 170393, 'carrots', 'veg', 'raw', [], 30, 300, ['carrot', 'carrots']],
  ['broccoli', 170379, 'broccoli', 'veg', 'raw', [], 30, 300, ['broccoli']],
  ['green_beans', 169961, 'green beans', 'veg', 'raw', [], 30, 300, ['green beans', 'beans']],
  ['spinach', 168462, 'spinach', 'veg', 'raw', [], 20, 200, ['spinach']],
  ['onion', 170000, 'onion', 'veg', 'raw', [], 20, 150, ['onion', 'onions']],
  ['romaine', 169247, 'romaine lettuce', 'veg', 'raw', [], 20, 200, ['lettuce', 'salad']],
  ['rocket', 169387, 'rocket', 'veg', 'raw', [], 10, 100, ['rocket', 'arugula', 'salad']],
  ['asparagus', 168389, 'asparagus', 'veg', 'raw', [], 30, 250, ['asparagus']],
  ['mushrooms', 169251, 'mushrooms', 'veg', 'raw', [], 30, 250, ['mushroom', 'mushrooms']],
  ['cauliflower', 169986, 'cauliflower', 'veg', 'raw', [], 30, 300, ['cauliflower']],
  ['aubergine', 169228, 'aubergine', 'veg', 'raw', [], 30, 300, ['aubergine', 'eggplant', 'brungiel']],
  ['peas', 170016, 'frozen peas', 'veg', 'raw', [], 30, 200, ['peas']],
  ['sweetcorn', 169998, 'sweetcorn', 'veg', 'raw', [], 30, 200, ['corn', 'sweetcorn']],
  ['kale', 168421, 'kale', 'veg', 'raw', [], 20, 200, ['kale']],
  ['cabbage', 169975, 'cabbage', 'veg', 'raw', [], 30, 300, ['cabbage']],
  ['celery', 169988, 'celery', 'veg', 'raw', ['celery'], 20, 150, ['celery']],
  ['beetroot', 169145, 'beetroot', 'veg', 'raw', [], 30, 250, ['beetroot', 'beets']],
  ['butternut_squash', 169295, 'butternut squash', 'veg', 'raw', [], 50, 400, ['butternut', 'squash', 'pumpkin']],
  ['garlic', 169230, 'garlic', 'flavour', 'raw', [], 2, 15, ['garlic']],
  ['ginger', 169231, 'fresh ginger', 'flavour', 'raw', [], 2, 15, ['ginger']],

  // ── Fruit (edible portion: no peel, core or stone) ─────────────────────
  ['apple', 171688, 'apple', 'fruit', 'raw', [], 80, 250, ['apple', 'apples']],
  ['banana', 173944, 'banana (peeled)', 'fruit', 'raw', [], 60, 200, ['banana', 'bananas']],
  ['orange', 169097, 'orange (peeled)', 'fruit', 'raw', [], 80, 250, ['orange', 'oranges']],
  ['blueberries', 171711, 'blueberries', 'fruit', 'raw', [], 40, 200, ['blueberries', 'berries']],
  ['strawberries', 167762, 'strawberries', 'fruit', 'raw', [], 50, 300, ['strawberries', 'strawberry', 'berries']],
  ['raspberries', 167755, 'raspberries', 'fruit', 'raw', [], 40, 200, ['raspberries', 'berries']],
  ['grapes', 174683, 'grapes', 'fruit', 'raw', [], 50, 200, ['grapes']],
  ['kiwi', 168153, 'kiwi (peeled)', 'fruit', 'raw', [], 60, 200, ['kiwi']],
  ['pineapple', 169124, 'pineapple', 'fruit', 'raw', [], 60, 250, ['pineapple']],
  ['mango', 169910, 'mango', 'fruit', 'raw', [], 60, 250, ['mango']],
  ['pear', 169118, 'pear', 'fruit', 'raw', [], 80, 250, ['pear', 'pears']],
  ['peach', 169928, 'peach', 'fruit', 'raw', [], 80, 250, ['peach', 'peaches']],
  ['nectarine', 169914, 'nectarine', 'fruit', 'raw', [], 80, 250, ['nectarine']],
  ['plums', 169949, 'plums', 'fruit', 'raw', [], 60, 250, ['plum', 'plums']],
  ['apricots', 171697, 'apricots', 'fruit', 'raw', [], 60, 250, ['apricot', 'apricots']],
  ['cherries', 171719, 'cherries', 'fruit', 'raw', [], 60, 200, ['cherries']],
  ['melon', 169092, 'melon', 'fruit', 'raw', [], 100, 350, ['melon', 'cantaloupe']],
  ['watermelon', 167765, 'watermelon', 'fruit', 'raw', [], 100, 400, ['watermelon']],
  ['figs', 173021, 'fresh figs', 'fruit', 'raw', [], 50, 200, ['fig', 'figs']],
  ['pomegranate', 169134, 'pomegranate seeds', 'fruit', 'raw', [], 30, 150, ['pomegranate']],
  ['medjool_dates', 168191, 'Medjool dates (stoned)', 'fruit', 'ready', [], 15, 60, ['dates', 'date']],

  // ── Fats (butter / ghee for cooking, olive oil raw only) ───────────────
  ['butter', 173430, 'butter', 'fat', 'ready', ['dairy'], 3, 25, ['butter']],
  ['ghee', 171314, 'ghee', 'fat', 'ready', ['dairy'], 3, 25, ['ghee']],
  ['olive_oil', 171413, 'extra virgin olive oil (raw, to dress)', 'fat', 'ready', [], 3, 20, ['olive oil', 'oil']],
  // Dairy-free cooking fats, for clients who can't have butter or ghee.
  ['coconut_oil', 171412, 'coconut oil', 'fat', 'ready', [], 3, 20, ['coconut oil', 'coconut', 'oil']],
  ['avocado_oil', 173573, 'avocado oil', 'fat', 'ready', [], 3, 20, ['avocado oil', 'oil']],
  ['beef_tallow', 171400, 'beef tallow', 'fat', 'ready', ['red_meat'], 3, 20, ['tallow', 'beef dripping']],
  ['avocado', 171705, 'avocado (flesh)', 'fat', 'raw', [], 30, 150, ['avocado', 'avocados']],
  ['olives', 169094, 'black olives', 'fat', 'ready', [], 10, 60, ['olives', 'olive']],
  ['walnuts', 170187, 'walnuts', 'fat', 'ready', ['tree_nut'], 5, 40, ['walnut', 'walnuts', 'nuts']],
  ['almonds', 170567, 'almonds', 'fat', 'ready', ['tree_nut'], 5, 40, ['almond', 'almonds', 'nuts']],
  ['cashews', 170162, 'cashews', 'fat', 'ready', ['tree_nut'], 5, 40, ['cashew', 'cashews', 'nuts']],
  ['pumpkin_seeds', 170556, 'pumpkin seeds', 'fat', 'ready', [], 5, 40, ['pumpkin seeds', 'seeds']],
  ['chia_seeds', 170554, 'chia seeds', 'fat', 'ready', [], 5, 30, ['chia', 'seeds']],
  ['flaxseed', 169414, 'ground flaxseed', 'fat', 'ready', [], 5, 30, ['flax', 'flaxseed', 'linseed', 'seeds']],
  ['sesame_seeds', 170150, 'sesame seeds', 'fat', 'ready', ['sesame'], 3, 20, ['sesame', 'seeds']],
  ['peanut_butter', 172470, 'peanut butter (100% peanuts)', 'fat', 'ready', ['peanut'], 10, 40, ['peanut butter', 'peanuts', 'peanut']],
  ['almond_butter', 168588, 'almond butter (100% almonds)', 'fat', 'ready', ['tree_nut'], 10, 40, ['almond butter', 'almonds', 'nuts']],
  ['coconut_milk', 170172, 'coconut milk', 'fat', 'ready', [], 30, 150, ['coconut milk', 'coconut']],
  ['dark_chocolate', 170273, '70–85% dark chocolate', 'fat', 'ready', [], 10, 30, ['chocolate', 'dark chocolate']],

  // ── Sauces & flavourings (all counted, however small) ──────────────────
  ['honey', 169640, 'honey', 'flavour', 'ready', [], 5, 25, ['honey']],
  ['maple_syrup', 169661, 'pure maple syrup', 'flavour', 'ready', [], 5, 25, ['maple syrup']],
  ['lemon_juice', 167747, 'lemon juice', 'flavour', 'ready', [], 5, 40, ['lemon']],
  ['lime_juice', 168156, 'lime juice', 'flavour', 'ready', [], 5, 40, ['lime']],
  ['balsamic', 172241, 'balsamic vinegar', 'flavour', 'ready', [], 5, 20, ['balsamic', 'vinegar']],
  ['mustard', 172234, 'mustard', 'flavour', 'ready', ['mustard'], 5, 20, ['mustard']],
  ['soy_sauce', 174277, 'soy sauce', 'flavour', 'ready', ['soy', 'gluten'], 5, 20, ['soy sauce', 'soy']],
  ['passata', 170460, 'tomato passata', 'flavour', 'ready', [], 50, 300, ['passata', 'tomato sauce', 'tomato', 'tomatoes']],
  ['chopped_tomatoes', 170501, 'tinned chopped tomatoes', 'flavour', 'ready', [], 50, 400, ['tinned tomatoes', 'tomato', 'tomatoes']],
  ['salsa', 174524, 'tomato salsa', 'flavour', 'ready', [], 20, 100, ['salsa']],
  ['hummus', 174289, 'hummus', 'flavour', 'ready', ['sesame', 'legume'], 20, 80, ['hummus', 'chickpeas', 'tahini']],
  ['pesto', 171579, 'basil pesto', 'flavour', 'ready', ['dairy', 'tree_nut'], 10, 30, ['pesto']],
  ['paprika', 171329, 'paprika', 'flavour', 'ready', [], 1, 5, ['paprika']],
  ['cumin', 170923, 'ground cumin', 'flavour', 'ready', [], 1, 5, ['cumin']],
  ['chilli_powder', 171319, 'chilli powder', 'flavour', 'ready', [], 1, 5, ['chilli', 'chili']],
  ['turmeric', 172231, 'turmeric', 'flavour', 'ready', [], 1, 5, ['turmeric']],
  ['cinnamon', 171320, 'cinnamon', 'flavour', 'ready', [], 1, 5, ['cinnamon']],
  ['oregano', 171328, 'dried oregano', 'flavour', 'ready', [], 1, 5, ['oregano', 'herbs']],
  ['garlic_powder', 171325, 'garlic powder', 'flavour', 'ready', [], 1, 5, ['garlic']],
  ['black_pepper', 170931, 'black pepper', 'flavour', 'ready', [], 1, 3, ['pepper']],
  ['basil', 172232, 'fresh basil', 'flavour', 'raw', [], 2, 15, ['basil', 'herbs']],
  ['parsley', 170416, 'fresh parsley', 'flavour', 'raw', [], 2, 15, ['parsley', 'herbs']],
  ['salt', 173468, 'salt', 'flavour', 'ready', [], 0, 3, ['salt']],
];

// ── Minimal CSV reader (USDA files are plain, double-quoted CSV) ──────────
function* rows(path: string): Generator<string[]> {
  const text = readFileSync(path, 'utf8');
  let i = 0;
  const n = text.length;
  let header = true;
  while (i < n) {
    const row: string[] = [];
    let field = '';
    let quoted = false;
    for (; i < n; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        i++;
        break;
      } else field += ch;
    }
    row.push(field);
    if (header) { header = false; continue; }
    if (row.length > 1) yield row;
  }
}

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: npx tsx scripts/build-meal-plan-ingredients.ts <unzipped SR Legacy folder>');
  process.exit(1);
}

const wanted = new Set(SPEC.map((s) => String(s[1])));
const desc = new Map<string, string>();
for (const [fdcId, , description] of rows(join(dir, 'food.csv'))) if (wanted.has(fdcId)) desc.set(fdcId, description);

// 1003 protein, 1004 fat, 1005 carbohydrate (by difference), 1079 fibre, 1008 energy (kcal)
const NUTRIENT: Record<string, 'p' | 'f' | 'c' | 'fib' | 'kcal'> = { '1003': 'p', '1004': 'f', '1005': 'c', '1079': 'fib', '1008': 'kcal' };
const values = new Map<string, Partial<Record<'p' | 'f' | 'c' | 'fib' | 'kcal', number>>>();
for (const r of rows(join(dir, 'food_nutrient.csv'))) {
  const [, fdcId, nutrientId, amount] = r;
  const key = NUTRIENT[nutrientId];
  if (!key || !wanted.has(fdcId)) continue;
  const v = values.get(fdcId) ?? {};
  v[key] = Number(amount);
  values.set(fdcId, v);
}

const seen = new Set<string>();
const out = SPEC.map(([id, fdcId, name, category, state, tags, minG, maxG, aliases]) => {
  if (seen.has(id)) throw new Error(`duplicate id ${id}`);
  seen.add(id);
  const d = desc.get(String(fdcId));
  const v = values.get(String(fdcId));
  if (!d || !v || v.p === undefined || v.f === undefined || v.c === undefined) throw new Error(`fdc_id ${fdcId} (${id}) missing from the dataset`);
  return {
    id, name, category, state, tags, minG, maxG, aliases: aliases ?? [],
    fdcId, usdaDescription: d,
    per100g: { protein: v.p, carbs: v.c, fat: v.f, fibre: v.fib ?? 0, usdaKcal: v.kcal ?? 0 },
  };
});

const file = `// GENERATED by scripts/build-meal-plan-ingredients.ts from USDA FoodData
// Central SR Legacy (April 2018). Do not edit by hand — change SPEC in the
// script and re-run it. Values are per 100 g of the stated state (raw, dry,
// drained, or ready to eat).
import type { Ingredient } from './ingredientTypes';

export const INGREDIENTS: Ingredient[] = ${JSON.stringify(out, null, 2)};
`;
writeFileSync(join(__dirname, '..', 'src', 'lib', 'mealPlan', 'ingredients.data.ts'), file);
console.log(`Wrote ${out.length} ingredients.`);
