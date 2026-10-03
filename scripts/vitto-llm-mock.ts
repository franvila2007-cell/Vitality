// Verifies the LLM merge path WITHOUT calling the model: feeds finishWithLLM a
// hand-written model response and checks database grounding + estimate handling.
import { createClient } from '@supabase/supabase-js';
import { processVittoMessage, finishWithLLM, type VittoContext } from '../src/lib/vitto/parser';
import { buildVittoFoods } from '../src/lib/vitto/buildFoods';
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const [g, sy] = await Promise.all([s.from('foods_global').select('name,type,data'), s.from('food_synonyms').select('phrase,canonical')]);
  const foods = buildVittoFoods(g.data || [], sy.data || [], []);
  const ctx: VittoContext = { foods, todayMeals: [], targets: { cal: 2000, prot: 150, carb: 200, fat: 65 }, mealTemplates: [], streakDays: 0, pending: null, clientFirstName: 'Test' };
  const text = '2 eggs and a chicken shawarma wrap and a grande oat milk caramel latte and some mystery sauce';
  const base = processVittoMessage(text, ctx);
  console.log('local needsLLM:', base.needsLLM, JSON.stringify(base.llmTexts), 'confident:', base.confident?.map((c) => c.label + '=' + c.cal));
  const merged = finishWithLLM(base, [
    { label: 'chicken shawarma wrap', db: 'shawarma', grams: 300, cal: 600, protein_g: 32, carbs_g: 48, fat_g: 30, confidence: 0.85, note: 'assumed a standard 300g wrap' },
    { label: 'grande oat milk caramel latte (473ml)', db: null, grams: 473, cal: 260, protein_g: 5, carbs_g: 40, fat_g: 8, confidence: 0.7, note: null },
    { label: 'mystery sauce', db: 'not-a-real-food', grams: 20, cal: 40, protein_g: 0, carbs_g: 8, fat_g: 1, confidence: 0.3, note: null },
    { label: 'garbage', db: null, grams: 5, cal: 99999, protein_g: 0, carbs_g: 0, fat_g: 0 },
  ], ctx, text);
  console.log(merged?.reply);
  console.log(merged?.actions.map((a) => a.kind === 'add_meal' ? `add(${a.entry.name}=${a.entry.cal}, db=${a.entry.matchedFood}, est=${a.entry.estimated})` : a.kind).join('\n'));
})();
