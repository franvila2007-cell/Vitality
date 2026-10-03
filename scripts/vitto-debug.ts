// Usage: npx tsx scripts/vitto-debug.ts "some message" ...  — shows how Vitto segments and resolves each phrase.
import { createClient } from '@supabase/supabase-js';
import { parseFoodText } from '../src/lib/vitto/foodParser';
import { buildVittoFoods } from '../src/lib/vitto/buildFoods';
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const [g, sy] = await Promise.all([s.from('foods_global').select('name,type,data'), s.from('food_synonyms').select('phrase,canonical')]);
  const foods = buildVittoFoods(g.data || [], sy.data || [], []);
  for (const t of process.argv.slice(2)) {
    const r = parseFoodText(t, foods);
    console.log(JSON.stringify({ t, segs: r.segments.map(x => ({ text: x.text, status: x.status, reasons: x.reasons, items: x.items.map(i => i.label + '=' + i.cal) })), needsLLM: r.needsLLM }));
  }
})();
