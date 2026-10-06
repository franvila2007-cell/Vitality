import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEAL_PLAN_SECTIONS } from '@/lib/mealPlan/questions';
import { parseFormSubmission } from '@/lib/assessment/submit';

// Public (no login): an IronBodyFit member requests a meal plan. Lands in
// meal_plan_requests (read at /coach/meal-plans), kept separate from the
// onboarding assessments. Service-role insert for the same reason as
// /api/assessment — see supabase/migrations/0009_meal_plan_requests.sql.
export async function POST(req: Request) {
  const parsed = await parseFormSubmission(req, MEAL_PLAN_SECTIONS);
  if ('response' in parsed) return parsed.response;
  const { submissionId, clean } = parsed;

  const admin = createAdminClient();
  const { error } = await admin.from('meal_plan_requests').upsert(
    {
      submission_id: submissionId,
      full_name: clean.full_name as string,
      email: (clean.email as string).toLowerCase(),
      phone: clean.phone as string,
      answers: clean,
    },
    { onConflict: 'submission_id', ignoreDuplicates: true }
  );

  if (error) {
    console.error('meal plan request insert failed', error);
    return NextResponse.json({ error: "We couldn't send your answers. Please try again in a moment." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
