// Usage: npx tsx scripts/vitto-chat.ts "message" ...  — runs full processVittoMessage (reply + actions) like the API route does.
import { createClient } from '@supabase/supabase-js';
import { processVittoMessage, type VittoContext } from '../src/lib/vitto/parser';
import { buildVittoFoods } from '../src/lib/vitto/buildFoods';
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const [g, sy] = await Promise.all([s.from('foods_global').select('name,type,data'), s.from('food_synonyms').select('phrase,canonical')]);
  const foods = buildVittoFoods(g.data || [], sy.data || [], []);
  const ctx: VittoContext = { foods, todayMeals: [{ id: 'x', name: '1 banana', cal: 105, prot: 1.3, carb: 27, fat: 0.4, matchedFood: 'banana', amount: 1, unit: 'banana' }], targets: { cal: 2000, prot: 150, carb: 200, fat: 65 }, mealTemplates: [], streakDays: 0, pending: null, clientFirstName: 'Test' };
  for (const t of process.argv.slice(2)) {
    const r = processVittoMessage(t, ctx);
    console.log('>', t, '\n  reply:', r.reply, '\n  actions:', r.actions.map((a) => a.kind === 'add_meal' ? `add(${a.entry.name}=${a.entry.cal})` : a.kind).join(', '), r.needsLLM ? '\n  needsLLM: ' + JSON.stringify(r.llmTexts) : '');
  }
})();
