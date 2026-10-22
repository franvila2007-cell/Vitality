import { NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEAL_PLAN_SECTIONS } from '@/lib/mealPlan/questions';
import { parseFormSubmission } from '@/lib/assessment/submit';
import { recordFunnelEvent } from '@/lib/crm/ingest';
import { startAndRun } from '@/lib/mealPlan/worker';

export const runtime = 'nodejs';
// The response goes back straight away; the meal-plan build runs after it.
export const maxDuration = 300;

// Public (no login): an IronBodyFit member requests a meal plan. Lands in
// meal_plan_requests (read at /coach/meal-plans), kept separate from the
// onboarding assessments. Service-role insert for the same reason as
// /api/assessment — see supabase/migrations/0009_meal_plan_requests.sql.
export async function POST(req: Request) {
  const parsed = await parseFormSubmission(req, MEAL_PLAN_SECTIONS);
  if ('response' in parsed) return parsed.response;
  const { submissionId, clean } = parsed;

  const started = Date.now();
  const admin = createAdminClient();
  const { data: inserted, error } = await admin.from('meal_plan_requests').upsert(
    {
      submission_id: submissionId,
      full_name: clean.full_name as string,
      // The IronBodyFit form asks for a phone number but no email.
      email: ((clean.email as string | undefined) ?? '').toLowerCase(),
      phone: (clean.phone as string | undefined) ?? '',
      answers: clean,
      source: 'ironbodyfit',
    },
    { onConflict: 'submission_id', ignoreDuplicates: true }
  ).select('id');

  if (error) {
    console.error('meal plan request insert failed', error);
    return NextResponse.json({ error: "We couldn't send your answers. Please try again in a moment." }, { status: 500 });
  }
  // Log it on the CRM contact after the response — never slows or fails the form.
  after(() => recordFunnelEvent(admin, {
    fullName: clean.full_name as string, email: (clean.email as string | undefined) ?? '', phone: (clean.phone as string | undefined) ?? null,
    brand: 'ironbodyfit',
    source: 'ironbodyfit', form: 'ironbodyfit', mealPlanClient: true, summary: `Requested an IronBodyFit meal plan${clean.goal ? ` · goal: ${clean.goal}` : ''}`, submissionId,
  }));
  // Build their meal plan in the background (src/lib/mealPlan). Only for a
  // newly saved request — a retried submission inserts nothing and so
  // starts nothing. Errors are logged; the hourly task retries stuck builds.
  const requestId = inserted?.[0]?.id;
  if (requestId) {
    after(() => startAndRun(admin, requestId, new URL(req.url).origin, started).catch((err) => {
      console.error('meal plan auto-build failed to start', { requestId, message: err instanceof Error ? err.message : String(err) });
    }));
  }
  return NextResponse.json({ ok: true });
}
