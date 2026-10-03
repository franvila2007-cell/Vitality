// Runs the Vitto regression battery against the REAL foods database (same
// merge the API route does) and prints a pass/fail report.
//   npx tsx scripts/vitto-eval.ts            -> summary + failures
//   npx tsx scripts/vitto-eval.ts --all      -> every case
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read-only queries).
import { createClient } from '@supabase/supabase-js';
import { processVittoMessage, type VittoContext } from '../src/lib/vitto/parser';
import { buildVittoFoods } from '../src/lib/vitto/buildFoods';
import { CASES } from './vitto-eval-cases';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing env'); process.exit(1); }
const supabase = createClient(url, key);

async function main() {
  const [g, s] = await Promise.all([
    supabase.from('foods_global').select('name, type, data'),
    supabase.from('food_synonyms').select('phrase, canonical'),
  ]);
  const foods = buildVittoFoods(g.data || [], s.data || [], []);
  const ctx: VittoContext = {
    foods, todayMeals: [{ id: 'x', name: 'seed', cal: 1, prot: 0, carb: 0, fat: 0 }],
    targets: { cal: 2000, prot: 150, carb: 200, fat: 65 }, mealTemplates: [], streakDays: 0, pending: null, clientFirstName: 'Test',
  };

  let pass = 0, llmDeferred = 0, fail = 0;
  const failures: string[] = [];
  const lines: string[] = [];
  for (const c of CASES) {
    const r = processVittoMessage(c.text, ctx);
    const adds = r.actions.filter((a) => a.kind === 'add_meal') as Extract<typeof r.actions[number], { kind: 'add_meal' }>[];
    const total = Math.round(adds.reduce((a, x) => a + x.entry.cal, 0));
    const asksCalories = r.actions.some((a) => a.kind === 'set_pending');
    const needsLLM = !!(r as { needsLLM?: boolean }).needsLLM;
    const inRange = adds.length > 0 && total >= c.kcal[0] && total <= c.kcal[1];
    const itemsOk = c.items === undefined || adds.length === c.items;
    let status: 'PASS' | 'LLM' | 'FAIL';
    if (inRange && itemsOk && !asksCalories) status = 'PASS';
    else if (c.llm && needsLLM) status = 'LLM';
    else status = 'FAIL';
    if (status === 'PASS') pass++; else if (status === 'LLM') llmDeferred++; else fail++;
    const detail = adds.map((a) => `${a.entry.name}=${a.entry.cal}`).join(' + ') || (asksCalories ? '(asked for calories)' : '(nothing)');
    const line = `${status.padEnd(4)} "${c.text}" -> ${total} kcal [want ${c.kcal[0]}-${c.kcal[1]}${c.items ? `, ${c.items} items` : ''}] ${detail}`;
    lines.push(line);
    if (status === 'FAIL') failures.push(line);
  }
  if (process.argv.includes('--all')) console.log(lines.join('\n'));
  else if (failures.length) console.log(failures.join('\n'));
  console.log(`\n${CASES.length} cases: ${pass} pass, ${llmDeferred} deferred-to-LLM, ${fail} FAIL`);
}
main();
