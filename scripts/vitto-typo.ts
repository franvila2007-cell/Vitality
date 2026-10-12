// Misspelling battery for Vitto: each typo must resolve to the intended food,
// and ordinary non-food messages must not be "corrected" into one.
//   SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL npx tsx scripts/vitto-typo.ts
import { createClient } from '@supabase/supabase-js';
import { buildVittoFoods } from '../src/lib/vitto/buildFoods';
import { parseFoodText } from '../src/lib/vitto/foodParser';

// [what the client typed, food key it should land on]
const POS: [string, string][] = [
  ['oaths', 'oats'], ['50g oaths', 'oats'], ['a bowl of oaths', 'oats'], ['oatss', 'oats'], ['porage', 'porridge'], ['porridg', 'porridge'], ['poridge', 'porridge'],
  ['brocoli', 'broccoli'], ['broccolli', 'broccoli'], ['brocolli', 'broccoli'], ['chiken', 'chicken breast'], ['chickn', 'chicken breast'], ['chicekn', 'chicken breast'],
  ['chiken breast', 'chicken breast'], ['chicken brest', 'chicken breast'], ['bananna', 'banana'], ['banan', 'banana'], ['bananaa', 'banana'], ['avacado', 'avocado'], ['avocadoe', 'avocado'],
  ['spagetti', 'spaghetti'], ['spagheti', 'spaghetti'], ['sandwhich', 'sandwich'], ['sandwitch', 'sandwich'], ['omlette', 'omelette'], ['omelete', 'omelette'],
  ['protien shake', 'protein shake'], ['protien bar', 'protein bar'], ['pancackes', 'pancakes'], ['pancaces', 'pancakes'], ['cerial', 'cereal'], ['cereel', 'cereal'],
  ['tomatoe', 'tomato'], ['potatoe', 'potato'], ['potatos', 'potato'], ['mushrom', 'mushrooms'], ['mushrooom', 'mushrooms'], ['cucmber', 'cucumber'], ['cucumbre', 'cucumber'],
  ['strawbery', 'strawberries'], ['strawberrys', 'strawberries'], ['blueberrys', 'blueberries'], ['bluberries', 'blueberries'], ['rasberries', 'raspberries'],
  ['cheeze', 'cheese'], ['chese', 'cheese'], ['chocolat', 'chocolate'], ['choclate', 'chocolate'], ['biscuts', 'biscuit'], ['yoghrt', 'yogurt'], ['yogourt', 'yogurt'],
  ['greek yoghrt', 'greek yogurt'], ['greek yogert', 'greek yogurt'], ['peanut buter', 'peanut butter'], ['peanut buttr', 'peanut butter'], ['peanutt butter', 'peanut butter'],
  ['salmom', 'salmon'], ['samon', 'salmon'], ['tunna', 'tuna'], ['prawnz', 'prawns'], ['shrimps', 'shrimp'], ['lasagne', 'lasagna'], ['lasgna', 'lasagna'], ['burito', 'burrito'], ['burrtio', 'burrito'],
  ['hamburger', 'burger'], ['hambuger', 'burger'], ['cheeseburger', 'cheeseburger'], ['cheesburger', 'cheeseburger'], ['pizzza', 'pizza slice'], ['piza', 'pizza slice'], ['pizzaa', 'pizza slice'],
  ['croissent', 'croissant'], ['croisant', 'croissant'], ['doughnut', 'donut'], ['muffn', 'muffin'], ['muffinn', 'muffin'], ['brownie', 'brownie'], ['browni', 'brownie'],
  ['icecream', 'ice cream'], ['ice crem', 'ice cream'], ['ice-cream', 'ice cream'], ['capuccino', 'cappuccino'], ['cappucino', 'cappuccino'], ['expresso', 'espresso'], ['espreso', 'espresso'],
  ['lattee', 'latte'], ['coffe', 'coffee'], ['cofee', 'coffee'], ['smoothy', 'smoothie'], ['smoothi', 'smoothie'], ['lemonade', 'lemonade'], ['vodka', 'vodka'],
  ['pasts', 'pasta'], ['paasta', 'pasta'], ['noodels', 'noodles'], ['nooodles', 'noodles'], ['sourdogh', 'sourdough'], ['sourdough', 'sourdough'], ['baggel', 'bagel'], ['bagle', 'bagel'],
  ['tortila', 'tortilla'], ['tortilaa', 'tortilla'], ['humus', 'hummus'], ['hummous', 'hummus'], ['guacamoli', 'guacamole'], ['guacomole', 'guacamole'], ['mozarella', 'mozzarella'], ['mozzarela', 'mozzarella'],
  ['parmesean', 'parmesan'], ['parmasan', 'parmesan'], ['halloumi', 'halloumi'], ['haloumi', 'halloumi'], ['quinoa', 'quinoa'], ['quinua', 'quinoa'], ['cous cous', 'couscous'], ['cuscus', 'couscous'],
  ['lentills', 'lentils'], ['chickpease', 'chickpeas'], ['chickpeaz', 'chickpeas'], ['almons', 'almonds'], ['almnds', 'almonds'], ['cashews', 'cashews'], ['walnuts', 'walnuts'], ['walnutz', 'walnuts'],
  ['steek', 'steak'], ['stake', 'steak'], ['sausge', 'sausage'], ['sausagge', 'sausage'], ['bacn', 'bacon'], ['bacoon', 'bacon'], ['turky', 'turkey'], ['turkye', 'turkey'],
  ['appple', 'apple'], ['aple', 'apple'], ['oragne', 'orange'], ['orrange', 'orange'], ['pinapple', 'pineapple'], ['pineaple', 'pineapple'], ['watermellon', 'watermelon'], ['watermelen', 'watermelon'],
  ['kiwii', 'kiwi'], ['mangoo', 'mango'], ['grappes', 'grapes'], ['grapez', 'grapes'], ['spinich', 'spinach'], ['spinnach', 'spinach'], ['letuce', 'lettuce'], ['lettuse', 'lettuce'],
  ['carrott', 'carrot'], ['carots', 'carrot'], ['onoin', 'onion'], ['onyon', 'onion'], ['garlick', 'garlic'], ['courgete', 'courgette'], ['zuchini', 'zucchini'], ['asparagas', 'asparagus'],
  ['cauliflour', 'cauliflower'], ['califlower', 'cauliflower'], ['sweetcorn', 'sweetcorn'], ['sweet potatoe', 'sweet potato'], ['sweet potatos', 'sweet potato'], ['brown ryce', 'brown rice'],
  ['bred', 'bread'], ['breaad', 'bread'], ['whole meal bread', 'bread'], ['wholemeel bread', 'wholemeal bread'], ['butterr', 'butter'], ['buter', 'butter'], ['margarine', 'margarine'],
  ['mayonaise', 'mayonnaise'], ['mayonnaize', 'mayonnaise'], ['ketchp', 'ketchup'], ['ketchupp', 'ketchup'], ['mustrd', 'mustard'], ['pesto', 'pesto'], ['peasto', 'pesto'],
  ['kebab', 'kebab'], ['kebap', 'kebab'], ['nuggets', 'chicken nuggets'], ['nugetts', 'chicken nuggets'], ['friess', 'fries'], ['frys', 'fries'], ['crisps', 'crisps'], ['crispz', 'crisps'],
  ['popcorn', 'popcorn'], ['popcron', 'popcorn'], ['whisky', 'whisky'], ['whiskey', 'whisky'], ['champagne', 'champagne'], ['shampagne', 'champagne'],
];

// Ordinary messages (food-free, or ones the engine must keep reading as it does today).
const NEG: string[] = [
  'hello', 'thanks', 'thank you so much', 'how many calories do i have left', 'undo', 'what should i eat tonight', 'i skipped lunch', 'i ran a mile today',
  'i am feeling great', 'good morning', 'can you help me', 'what is my protein target', 'i went to the gym', 'my coach said hello', 'remove the last one',
  'how are you', 'i walked ten thousand steps', 'what time is it', 'tell me a joke', 'i want to lose weight', 'cool', 'ok', 'amazing work today',
];

(async () => {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const [g, sy] = await Promise.all([s.from('foods_global').select('name,type,data'), s.from('food_synonyms').select('phrase,canonical')]);
  const foods = buildVittoFoods(g.data || [], sy.data || [], []);
  let fail = 0;
  const miss: string[] = [];
  for (const [typed, want] of POS) {
    const r = parseFoodText(typed, foods);
    const got = r.segments.flatMap((x) => x.items.map((i) => i.matchedFood));
    const ok = got.includes(want) || (foods.db[want] === undefined);
    if (!ok) { fail++; miss.push(`  "${typed}" → ${got.join(', ') || '(nothing)'}  (wanted ${want})`); }
  }
  const falsePos: string[] = [];
  for (const t of NEG) {
    const r = parseFoodText(t, foods);
    const got = r.segments.flatMap((x) => x.items.map((i) => i.matchedFood));
    if (got.length) { fail++; falsePos.push(`  "${t}" → ${got.join(', ')}`); }
  }
  const skipped = POS.filter(([, w]) => foods.db[w] === undefined).map(([, w]) => w);
  console.log(`typo battery: ${POS.length - miss.length - skipped.length}/${POS.length - skipped.length} fixed${skipped.length ? ` (${new Set(skipped).size} target foods not in the DB: ${[...new Set(skipped)].join(', ')})` : ''}`);
  if (miss.length) console.log('MISSED:\n' + miss.join('\n'));
  console.log(`non-food messages: ${NEG.length - falsePos.length}/${NEG.length} left alone`);
  if (falsePos.length) console.log('FALSE MATCHES:\n' + falsePos.join('\n'));
  process.exit(fail ? 1 : 0);
})();
