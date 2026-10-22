// Builds one client's meal plan end to end (no Gamma call) and writes the
// result for review:
//   npx tsx scripts/meal-plan-dry-run.ts <meal_plan_requests id> <output dir>
// Uses .env.local (Supabase service role + ANTHROPIC_API_KEY). Calls Claude.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Answers } from '../src/lib/assessment/questions';
import { runStage, type PlanState, type Stage, type StageResult } from '../src/lib/mealPlan/pipeline';
import { recipeIngredientsLine } from '../src/lib/mealPlan/gammaContent';

process.loadEnvFile('.env.local');

async function main() {
  const [id, outDir] = process.argv.slice(2);
  if (!id || !outDir) throw new Error('Usage: npx tsx scripts/meal-plan-dry-run.ts <request id> <output dir>');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await admin.from('meal_plan_requests').select('answers').eq('id', id).single();
  if (error) throw error;

  const started = Date.now();
  let stage: Stage = 'intake';
  let state: PlanState = {};
  let result: StageResult | null = null;
  while (stage !== 'done') {
    console.error(`… ${stage}`);
    result = await runStage(stage, state, data.answers as Answers);
    state = result.state;
    stage = result.next;
  }
  const plan = { intake: state.intake!, targets: state.targets!, recipes: state.recipes!, usage: state.usage ?? [], issues: result!.outcome!.issues, gamma: result!.outcome!.gamma };
  mkdirSync(outDir, { recursive: true });

  const t = plan.targets;
  const lines = [
    `# ${plan.intake.fullName} — dry run`,
    '',
    `Maintenance ${t.maintenanceKcal} kcal · Target ${t.targetKcal} kcal · P ${t.protein} g · C ${t.carbs} g · F ${t.fat} g`,
    `Meals: ${t.meals.map((m) => `${m.label} ~${m.kcal} kcal / ${m.protein} g P`).join(' · ')}`,
    '',
    `Excluded tags: ${plan.intake.rules.excludedTags.join(', ') || 'none'}`,
    `Excluded ingredients: ${plan.intake.rules.excludedIngredientIds.join(', ') || 'none'}`,
    `Excluded words: ${plan.intake.rules.excludedTerms.join(', ') || 'none'}`,
    `Avoid styles: ${plan.intake.rules.avoidDishStyles.join(', ') || 'none'}`,
    `Note: ${plan.intake.rules.exclusionNote || '—'}`,
    '',
    ...t.meals.flatMap((m) => [
      `## ${m.label} (target ${m.kcal} kcal)`,
      ...plan.recipes.filter((r) => r.slot === m.slot).flatMap((r) => {
        const d = r.fit.nutrition.display;
        return [`### ${r.name} — ${d.kcal} kcal · P ${d.protein} g · C ${d.carbs} g · F ${d.fat} g ${r.fit.ok ? '' : '⚠'}`, `${recipeIngredientsLine(r)}. ${r.method}`, `photo search: ${r.photoQuery}`, ''];
      }),
    ]),
    '## Checks',
    ...(plan.issues.length ? plan.issues.map((i) => `- [${i.level}] ${i.message}`) : ['- all passed']),
    '',
    `Claude: ${plan.usage.map((u) => `${u.model} ${u.inputTokens} in / ${u.outputTokens} out`).join('; ')} · ${Math.round((Date.now() - started) / 1000)} s`,
  ];
  writeFileSync(join(outDir, 'plan.md'), lines.join('\n'));
  writeFileSync(join(outDir, 'gamma-prompt.md'), plan.gamma.prompt);
  writeFileSync(join(outDir, 'plan.json'), JSON.stringify(plan, null, 2));
  console.log(lines.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
