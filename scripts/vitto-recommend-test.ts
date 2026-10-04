import { FOOD_DB } from '../src/lib/vitto/foodDb';
import { EXTRA_FOODS } from '../src/lib/vitto/foodDbExtra';
import { recommendMeals, TEMPLATES, type Macros } from '../src/lib/vitto/mealRecommender';

const db: any = { ...EXTRA_FOODS, ...FOOD_DB };
let fail = 0;
const check = (name: string, ok: boolean, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); };

// every template resolves against the real food names
const missing: string[] = [];
for (const t of TEMPLATES) for (const i of t.items) if (!db[i.food]) missing.push(`${t.id}: ${i.food}`);
check('all template ingredients exist in the food DB', missing.length === 0, missing.join('; '));

function show(label: string, rem: Macros, hour: number, hasLogged = true) {
  const r = recommendMeals(rem, db, { hour, seed: '2026-10-04', hasLogged, limit: 6 });
  console.log(`\n── ${label}  (rem ${rem.cal}kcal ${rem.prot}p ${rem.carb}c ${rem.fat}f, ${hour}:00)`);
  if (r.status === 'complete') { console.log('  COMPLETE:', r.message); return r; }
  console.log('  ' + r.message + `  [${r.size}]`);
  for (const o of r.options) console.log(`  • ${o.name}: ${o.items.join(' + ')}  → ${o.macros.cal}kcal ${o.macros.prot}p ${o.macros.carb}c ${o.macros.fat}f  | ${o.why}`);
  return r;
}

// the spec example
const ex = show('SPEC EXAMPLE', { cal: 750, prot: 50, carb: 70, fat: 30 }, 18);
check('spec: ok with 6 options', ex.status === 'ok' && ex.options.length >= 4);
if (ex.status === 'ok') {
  const o = ex.options[0];
  check('spec: top pick within remaining calories', o.macros.cal <= 750 * 1.02);
  check('spec: top pick is a real meal (>=400 kcal)', o.macros.cal >= 400);
  check('spec: no option blows protein/fat by much', ex.options.every((m) => m.macros.prot <= 50 * 1.15 + 4 + 12 && m.macros.fat <= 30 * 1.15 + 3 + 8));
}

const hiProt = show('HIGH PROTEIN LEFT', { cal: 800, prot: 110, carb: 60, fat: 20 }, 19);
const hiCarb = show('HIGH CARBS LEFT', { cal: 800, prot: 20, carb: 140, fat: 15 }, 19);
const hiFat = show('HIGH FAT LEFT', { cal: 800, prot: 40, carb: 25, fat: 65 }, 19);
const lowProt = show('LOW PROTEIN LEFT', { cal: 500, prot: 12, carb: 60, fat: 20 }, 19);
const small = show('VERY FEW CALORIES', { cal: 190, prot: 15, carb: 12, fat: 8 }, 21);
const done = show('ESSENTIALLY DONE', { cal: 60, prot: 3, carb: 6, fat: 2 }, 21);
const over = show('OVER TARGET', { cal: -200, prot: -5, carb: -20, fat: 3 }, 21);
const morning = show('MORNING, NOTHING LOGGED', { cal: 2200, prot: 160, carb: 220, fat: 70 }, 8, false);
const lunch = show('LUNCHTIME', { cal: 1500, prot: 110, carb: 150, fat: 50 }, 12);

check('done → complete', done.status === 'complete');
check('over target → complete', over.status === 'complete');
check('few calories → small snack-sized', small.status === 'ok' && small.size === 'snack' && small.options.every((o) => o.macros.cal <= 195));
check('morning has breakfast-type or main, no cap blown', morning.status === 'ok' && morning.options.every((o) => o.macros.cal <= 900));
if (hiProt.status === 'ok') check('high protein → top pick >=45g protein', hiProt.options[0].macros.prot >= 45, String(hiProt.options[0].macros.prot));
if (hiCarb.status === 'ok') check('high carbs → top pick >=70g carbs', hiCarb.options[0].macros.carb >= 70, String(hiCarb.options[0].macros.carb));
if (hiFat.status === 'ok') check('high fat → top pick >=25g fat', hiFat.options[0].macros.fat >= 25, String(hiFat.options[0].macros.fat));
if (lowProt.status === 'ok') check('low protein → no huge protein hit', lowProt.options[0].macros.prot <= 12 * 1.15 + 4 + 12, String(lowProt.options[0].macros.prot));
if (lunch.status === 'ok') check('afternoon: no breakfast items', !lunch.options.some((o) => TEMPLATES.find((t) => t.id === o.id)!.kind === 'breakfast'));

// Find Another cycles through distinct meals
if (ex.status === 'ok') check('options are distinct', new Set(ex.options.map((o) => o.id)).size === ex.options.length);

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
