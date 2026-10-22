// The meal-plan build, one step at a time:
//   intake  → read the form, work out the food rules, calculate targets
//   recipes → Claude writes the recipes; portions fitted from USDA data
//   repair  → replace any recipe that couldn't reach its calories
//   checks  → validate everything and write the Gamma instructions
// Each step is a short server call whose output is saved on the meal_plans
// row, so a timeout or crash resumes from the last finished step. Server-only.
import type { Answers } from '@/lib/assessment/questions';
import type { createAdminClient } from '@/lib/supabase/admin';
import { allowedIngredients, readIntake, type Intake } from './intake';
import { calculateTargets, type Targets } from './targets';
import { proposeRecipes, repairRecipes, type Recipe } from './recipes';
import { validatePlan, type Issue } from './validate';
import { buildGammaPrompt, checkGammaPrompt } from './gammaContent';
import type { ClaudeUsage } from './claude';

type Admin = ReturnType<typeof createAdminClient>;

export type Stage = 'intake' | 'recipes' | 'repair' | 'checks' | 'done';

type StoredIntake = Omit<Intake, 'allowed' | 'usage'>;

export type PlanState = {
  intake?: StoredIntake;
  targets?: Targets;
  recipes?: Recipe[];
  usage?: ClaudeUsage[];
};

export type StageResult = {
  state: PlanState;
  next: Stage;
  /** set when the build has finished */
  outcome?: { issues: Issue[]; gamma: { title: string; prompt: string } };
};

const MAX_ATTEMPTS = 3;
const LEASE_MS = 5 * 60 * 1000;

const hydrate = (s: StoredIntake): Intake => ({ ...s, allowed: allowedIngredients(s.rules), usage: null });

/** Runs one stage on in-memory state. No database access — the dry-run script uses this directly. */
export async function runStage(stage: Stage, state: PlanState, answers: Answers): Promise<StageResult> {
  const usage = [...(state.usage ?? [])];
  switch (stage) {
    case 'intake': {
      const intake = await readIntake(answers);
      const targets = calculateTargets(intake.targets);
      targets.flags.push(...intake.flags);
      if (intake.usage) usage.push(intake.usage);
      const stored: StoredIntake = { firstName: intake.firstName, fullName: intake.fullName, targets: intake.targets, rules: intake.rules, cookingTime: intake.cookingTime, mealStyle: intake.mealStyle, flags: intake.flags };
      return { state: { ...state, intake: stored, targets, usage }, next: 'recipes' };
    }
    case 'recipes': {
      const { recipes, usage: u } = await proposeRecipes(hydrate(state.intake!), state.targets!.meals);
      return { state: { ...state, recipes, usage: [...usage, u] }, next: 'repair' };
    }
    case 'repair': {
      const { recipes, usage: u } = await repairRecipes(hydrate(state.intake!), state.targets!.meals, state.recipes!);
      return { state: { ...state, recipes, usage: u ? [...usage, u] : usage }, next: 'checks' };
    }
    case 'checks': {
      const intake = state.intake!;
      // Stock photos come in the next phase; until then every recipe is left without one.
      const photos = new Map<string, string | null>();
      const input = { fullName: intake.fullName, firstName: intake.firstName, targets: state.targets!, rules: intake.rules, recipes: state.recipes! };
      const issues = validatePlan(input);
      const gamma = buildGammaPrompt({ ...input, photos });
      for (const m of checkGammaPrompt(gamma.prompt, { ...input, photos })) issues.push({ level: 'blocker', message: m });
      return { state, next: 'done', outcome: { issues, gamma } };
    }
    default:
      throw new Error(`Nothing to run at stage "${stage}"`);
  }
}

/** Starts a new build (a new version) for a meal-plan request. */
export async function startPlan(admin: Admin, requestId: string): Promise<string> {
  const { data: last } = await admin.from('meal_plans').select('version').eq('request_id', requestId).order('version', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from('meal_plans').insert({ request_id: requestId, version: (last?.version ?? 0) + 1 }).select('id').single();
  if (error) throw error;
  return data.id;
}

/**
 * Advances a build by one stage. Safe to call repeatedly and concurrently:
 * a lease makes sure only one call runs a stage at a time, and a failed
 * stage is retried on the next call, up to MAX_ATTEMPTS.
 */
export async function advancePlan(admin: Admin, planId: string): Promise<{ status: string; stage: string }> {
  const now = new Date();
  const { data: claimed } = await admin.from('meal_plans')
    .update({ locked_until: new Date(now.getTime() + LEASE_MS).toISOString() })
    .eq('id', planId).eq('status', 'building')
    .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`)
    .select('id, request_id, stage, state, attempts').maybeSingle();
  if (!claimed) {
    const { data: row } = await admin.from('meal_plans').select('status, stage').eq('id', planId).single();
    return { status: row?.status ?? 'missing', stage: row?.stage ?? '' };
  }

  const { data: request, error: reqErr } = await admin.from('meal_plan_requests').select('answers').eq('id', claimed.request_id).single();
  if (reqErr) throw reqErr;

  try {
    const result = await runStage(claimed.stage as Stage, claimed.state as PlanState, request.answers as Answers);
    const finished = result.outcome;
    const status = !finished ? 'building' : finished.issues.some((i) => i.level === 'blocker') ? 'needs_review' : 'ready';
    await admin.from('meal_plans').update({
      state: result.state as never,
      stage: result.next,
      status,
      attempts: 0,
      last_error: null,
      locked_until: null,
      ...(finished ? { issues: finished.issues as never, gamma_title: finished.gamma.title, gamma_prompt: finished.gamma.prompt } : {}),
    }).eq('id', planId);
    return { status, stage: result.next };
  } catch (err) {
    const attempts = claimed.attempts + 1;
    const message = err instanceof Error ? err.message : String(err);
    console.error('meal plan stage failed', { planId, stage: claimed.stage, attempts, message });
    await admin.from('meal_plans').update({
      attempts,
      last_error: message.slice(0, 500),
      locked_until: null,
      ...(attempts >= MAX_ATTEMPTS ? { status: 'failed' as const } : {}),
    }).eq('id', planId);
    return { status: attempts >= MAX_ATTEMPTS ? 'failed' : 'building', stage: claimed.stage };
  }
}
