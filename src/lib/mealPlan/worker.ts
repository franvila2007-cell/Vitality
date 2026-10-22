// Background work for automated meal plans, run after a form submission and
// by /api/meal-plans/worker: push queued builds forward within this call's
// time budget, email the coach about finished plans, and hand any remaining
// work to a fresh call. Server-only.
import type { createAdminClient } from '@/lib/supabase/admin';
import { drivePlan, startPlan } from './pipeline';
import { notifyPlans } from './notify';

type Admin = ReturnType<typeof createAdminClient>;

/** Seconds a single serverless call may run (maxDuration on the routes that call this). */
export const WORK_SECONDS = 300;

/** Fire-and-forget: ask a fresh serverless call to carry on. */
export async function kickWorker(appUrl: string): Promise<void> {
  try {
    await fetch(`${appUrl}/api/meal-plans/worker`, { method: 'POST', signal: AbortSignal.timeout(3000) });
  } catch {
    // The request only needs to be sent; the hourly task is the safety net.
  }
}

/** Starts a plan for a new IronBody Fit request (once) and works on it. */
export async function startAndRun(admin: Admin, requestId: string, appUrl: string, startedAt: number): Promise<void> {
  const { data: existing } = await admin.from('meal_plans').select('id').eq('request_id', requestId).limit(1).maybeSingle();
  if (existing) return;
  const planId = await startPlan(admin, requestId);
  const finished = await drivePlan(admin, planId, startedAt + WORK_SECONDS * 1000);
  if (finished) await notifyPlans(admin, appUrl);
  else await kickWorker(appUrl);
}

/** Works through builds still in progress (oldest first), then emails finished plans. */
export async function runWorker(admin: Admin, appUrl: string, startedAt: number): Promise<{ advanced: number; emailed: number; remaining: number }> {
  const deadline = startedAt + WORK_SECONDS * 1000;
  const { data: building } = await admin.from('meal_plans').select('id').eq('status', 'building')
    .or(`locked_until.is.null,locked_until.lt.${new Date().toISOString()}`)
    .order('created_at').limit(5);
  let advanced = 0;
  let unfinished = false;
  for (const p of building ?? []) {
    if (Date.now() > deadline - 150_000) { unfinished = true; break; }
    const done = await drivePlan(admin, p.id, deadline);
    advanced++;
    if (!done) unfinished = true;
  }
  const emailed = await notifyPlans(admin, appUrl);
  const { count } = await admin.from('meal_plans').select('id', { count: 'exact', head: true }).eq('status', 'building');
  if (unfinished || (count ?? 0) > advanced) await kickWorker(appUrl);
  return { advanced, emailed, remaining: count ?? 0 };
}
