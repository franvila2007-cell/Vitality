// The meal-plan build, one step at a time:
//   intake  → read the form, work out the food rules, calculate targets
//   recipes → Claude writes the recipes; portions fitted from USDA data
//   repair  → replace any recipe that couldn't reach its calories
//   photos  → find, check and store a stock photo for every recipe
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
import { findPhoto, type ChosenPhoto } from './photos';
import { buildLibraryHtml } from './libraryDoc';
import { ibfLocation } from './questions';

type Admin = ReturnType<typeof createAdminClient>;

export type Stage = 'intake' | 'recipes' | 'repair' | 'photos' | 'checks' | 'done';

type StoredIntake = Omit<Intake, 'allowed' | 'usage'>;

export type PlanState = {
  intake?: StoredIntake;
  targets?: Targets;
  recipes?: Recipe[];
  /** Per recipe name: the chosen photo, or null when none matched */
  photos?: Record<string, ChosenPhoto | null>;
  usage?: ClaudeUsage[];
};

/** Database access for the stages that need it (photos). Absent in the dry-run script. */
export type StageContext = { admin?: Admin; planId?: string; deadline?: number };

const PHOTO_CONCURRENCY = 3;

export type StageResult = {
  state: PlanState;
  next: Stage;
  /** set when the build has finished */
  outcome?: { issues: Issue[]; gamma: { title: string; prompt: string }; libraryHtml: string };
};

const MAX_ATTEMPTS = 3;
const LEASE_MS = 5 * 60 * 1000;

const hydrate = (s: StoredIntake): Intake => ({ ...s, allowed: allowedIngredients(s.rules), usage: null });

/** Runs one stage on in-memory state. No database access — the dry-run script uses this directly. */
export async function runStage(stage: Stage, state: PlanState, answers: Answers, ctx: StageContext = {}): Promise<StageResult> {
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
      return { state: { ...state, recipes, usage: u ? [...usage, u] : usage }, next: 'photos' };
    }
    case 'photos': {
      const photos = { ...(state.photos ?? {}) };
      if (!ctx.admin || !ctx.planId) return { state: { ...state, photos }, next: 'checks' };
      // A few recipes at a time; stop early near the deadline and carry on in the next call.
      const todo = state.recipes!.filter((r) => !(r.name in photos));
      for (let i = 0; i < todo.length; i += PHOTO_CONCURRENCY) {
        if (ctx.deadline && Date.now() > ctx.deadline - 90_000) break;
        const batch = todo.slice(i, i + PHOTO_CONCURRENCY);
        // A photo that can't be found or checked is left out (and flagged by the
        // checks) rather than holding up the whole plan.
        const found = await Promise.all(batch.map((r) => findPhoto(ctx.admin!, ctx.planId!, r, state.intake!.rules, usage).catch((err) => {
          console.error('meal plan photo failed', { planId: ctx.planId, recipe: r.name, message: err instanceof Error ? err.message : String(err) });
          return null;
        })));
        batch.forEach((r, n) => { photos[r.name] = found[n]; });
      }
      const done = state.recipes!.every((r) => r.name in photos);
      return { state: { ...state, photos, usage }, next: done ? 'checks' : 'photos' };
    }
    case 'checks': {
      const intake = state.intake!;
      const photos = new Map<string, string | null>(state.recipes!.map((r) => [r.name, state.photos?.[r.name]?.url ?? null]));
      const input = { fullName: intake.fullName, firstName: intake.firstName, targets: state.targets!, rules: intake.rules, recipes: state.recipes! };
      const issues = validatePlan({ ...input, photos: state.photos ? photos : undefined });
      const gamma = buildGammaPrompt({ ...input, photos });
      for (const m of checkGammaPrompt(gamma.prompt, { ...input, photos })) issues.push({ level: 'blocker', message: m });
      const libraryHtml = buildLibraryHtml({
        fullName: intake.fullName, location: ibfLocation(answers), createdAt: new Date(),
        targets: state.targets!, exclusionNote: intake.rules.exclusionNote, recipes: state.recipes!, photos: state.photos, issues,
      });
      return { state, next: 'done', outcome: { issues, gamma, libraryHtml } };
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
export async function advancePlan(admin: Admin, planId: string, opts: { deadline?: number } = {}): Promise<{ status: string; stage: string }> {
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
    const result = await runStage(claimed.stage as Stage, claimed.state as PlanState, request.answers as Answers, { admin, planId, deadline: opts.deadline });
    const finished = result.outcome;
    const status = !finished ? 'building' : finished.issues.some((i) => i.level === 'blocker') ? 'needs_review' : 'ready';
    await admin.from('meal_plans').update({
      state: result.state as never,
      stage: result.next,
      status,
      attempts: 0,
      last_error: null,
      locked_until: null,
      ...(finished ? { issues: finished.issues as never, gamma_title: finished.gamma.title, gamma_prompt: finished.gamma.prompt, library_html: finished.libraryHtml } : {}),
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

/**
 * Runs a build's stages back to back until it finishes or the time budget
 * runs low (a stage can take a couple of minutes). Returns true when the
 * build is no longer building.
 */
export async function drivePlan(admin: Admin, planId: string, deadline: number): Promise<boolean> {
  for (let i = 0; i < 12; i++) {
    if (Date.now() > deadline - 150_000) return false;
    const { status } = await advancePlan(admin, planId, { deadline });
    if (status !== 'building') return true;
  }
  return false;
}
