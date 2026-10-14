// Real-life phrases a UK/Malta client types. Prints what the LOCAL engine
// (no AI) makes of each, so gaps are easy to see.
//   SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL npx tsx scripts/vitto-realworld.ts [file-with-phrases]
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { buildVittoFoods } from '../src/lib/vitto/buildFoods';
import { parseFoodText } from '../src/lib/vitto/foodParser';
(async () => {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const [g, sy] = await Promise.all([s.from('foods_global').select('name,type,data'), s.from('food_synonyms').select('phrase,canonical')]);
  const foods = buildVittoFoods(g.data || [], sy.data || [], []);
  const phrases = readFileSync(process.argv[2] || 'scripts/vitto-realworld.txt', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  let ok = 0, llm = 0, none = 0;
  for (const p of phrases) {
    const r = parseFoodText(p, foods);
    const items = r.segments.flatMap((x) => x.items);
    const total = Math.round(items.reduce((a, i) => a + i.cal, 0));
    const tag = r.needsLLM ? 'LLM ' : items.length ? 'ok  ' : 'NONE';
    if (r.needsLLM) llm++; else if (items.length) ok++; else none++;
    console.log(`${tag} ${p.padEnd(46)} ${items.length ? items.map((i) => `${i.label}=${i.cal}`).join(' + ') + `  [${total}]` : ''}${r.needsLLM ? '  ⟵ ' + JSON.stringify(r.llmTexts) : ''}`);
  }
  console.log(`\n${phrases.length} phrases: ${ok} local, ${llm} need AI, ${none} nothing`);
})();
