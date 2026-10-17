import { NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseFormSubmission } from '@/lib/assessment/submit';
import { recordFunnelEvent } from '@/lib/crm/ingest';
import { CHALLENGE_COHORT, CHALLENGE_SECTIONS, hasHealthFlag, instagramHandle } from '@/lib/challenge/questions';

// Public (no login): 8-Week Challenge intake, filled in straight after paying
// on Stripe. Saved with the service-role key — challenge_intakes has no
// public policies at all (0018_challenge_intakes.sql) — then linked to the
// person's CRM contact (email, then phone, else a new one) tagged
// 8-week-challenge.
export async function POST(req: Request) {
  const parsed = await parseFormSubmission(req, CHALLENGE_SECTIONS);
  if ('response' in parsed) return parsed.response;
  const { submissionId, clean } = parsed;

  const healthFlag = hasHealthFlag(clean);
  const goal = clean.main_goal === 'Other' ? `Other: ${clean.main_goal_other}` : (clean.main_goal as string);
  const admin = createAdminClient();
  const { error } = await admin.from('challenge_intakes').upsert(
    {
      submission_id: submissionId,
      cohort: CHALLENGE_COHORT,
      full_name: clean.full_name as string,
      email: (clean.email as string).toLowerCase(),
      phone: clean.phone as string,
      instagram: instagramHandle(clean.instagram as string | undefined),
      age: Math.round(Number(clean.age)),
      height_cm: Number(clean.height),
      weight_kg: Number(clean.weight),
      main_goal: goal,
      health_flag: healthFlag,
      answers: clean,
    },
    { onConflict: 'submission_id', ignoreDuplicates: true }
  );
  if (error) {
    console.error('challenge intake insert failed', error);
    return NextResponse.json({ error: "We couldn't save your answers. Please try again in a moment — they're saved on this device." }, { status: 500 });
  }

  // CRM after the response — never slows or fails the form.
  after(async () => {
    const contactId = await recordFunnelEvent(admin, {
      fullName: clean.full_name as string, email: clean.email as string, phone: clean.phone as string,
      source: 'challenge', brand: 'vitality', form: 'challenge', submissionId,
      matchPhone: true, addTags: ['8-week-challenge'],
      summary: `Joined the 8-Week Challenge (Oct 2026) · ${goal}${healthFlag ? '\n⚠️ Answered Yes to a health question' : ''}`,
    });
    if (contactId) await admin.from('challenge_intakes').update({ crm_contact_id: contactId }).eq('submission_id', submissionId);
  });
  return NextResponse.json({ ok: true });
}
