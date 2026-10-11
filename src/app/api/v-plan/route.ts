import { NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { V_PLAN_SECTIONS } from '@/lib/mealPlan/vPlanQuestions';
import { parseFormSubmission } from '@/lib/assessment/submit';
import { recordFunnelEvent } from '@/lib/crm/ingest';
import { heardInfo } from '@/lib/crm/heard';

// Public (no login): a Vitality client requests a V Plan (meal plan). Shares
// meal_plan_requests with the IronBodyFit form, tagged source = 'vitality',
// and is read at /coach/v-plans. Service-role insert for the same reason as
// /api/assessment — see supabase/migrations/0009 and 0010.
export async function POST(req: Request) {
  const parsed = await parseFormSubmission(req, V_PLAN_SECTIONS);
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
      source: 'vitality',
    },
    { onConflict: 'submission_id', ignoreDuplicates: true }
  );

  if (error) {
    console.error('v plan request insert failed', error);
    return NextResponse.json({ error: "We couldn't send your answers. Please try again in a moment." }, { status: 500 });
  }
  // Log it on the CRM contact after the response — never slows or fails the form.
  const heard = heardInfo(clean);
  after(() => recordFunnelEvent(admin, {
    fullName: clean.full_name as string, email: clean.email as string, phone: clean.phone as string,
    source: 'v_plan', form: 'v_plan', submissionId,
    summary: `Requested a Vitality meal plan${clean.goal ? ` · goal: ${clean.goal}` : ''}${heard.phrase ? ` · ${heard.phrase}` : ''}`,
    contactSource: heard.source, extra: heard.extra,
  }));
  return NextResponse.json({ ok: true });
}
