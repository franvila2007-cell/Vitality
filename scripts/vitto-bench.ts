import { createClient } from '@supabase/supabase-js';
import { processVittoMessage, type VittoContext } from '../src/lib/vitto/parser';
import { buildVittoFoods } from '../src/lib/vitto/buildFoods';
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const [g, sy] = await Promise.all([s.from('foods_global').select('name,type,data'), s.from('food_synonyms').select('phrase,canonical')]);
  const t0 = performance.now();
  const N = 50;
  for (let i = 0; i < N; i++) {
    // fresh foods object each time = worst case (the API route builds one per request)
    const foods = buildVittoFoods(g.data || [], sy.data || [], []);
    const ctx: VittoContext = { foods, todayMeals: [], targets: { cal: 2000, prot: 150, carb: 200, fat: 65 }, mealTemplates: [], streakDays: 0, pending: null, clientFirstName: 'T' };
    processVittoMessage('for breakfast I had 3 eggs, 2 slices of toast with butter and a large latte, then a banana', ctx);
  }
  console.log('avg ms per request (cold index):', ((performance.now() - t0) / N).toFixed(2));
})();
