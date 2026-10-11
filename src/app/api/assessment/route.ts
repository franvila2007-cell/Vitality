import { NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SECTIONS } from '@/lib/assessment/questions';
import { parseFormSubmission } from '@/lib/assessment/submit';
import { recordFunnelEvent } from '@/lib/crm/ingest';

// Public (no login): a brand-new client submits their onboarding assessment.
// The insert uses the service-role key because the assessments table has no
// public insert policy (see supabase/migrations/0007_assessments.sql).
export async function POST(req: Request) {
  const parsed = await parseFormSubmission(req, SECTIONS);
  if ('response' in parsed) return parsed.response;
  const { submissionId, clean } = parsed;

  const admin = createAdminClient();
  const { error } = await admin.from('assessments').upsert(
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
    console.error('assessment insert failed', error);
    return NextResponse.json({ error: "We couldn't save your assessment. Please try again in a moment." }, { status: 500 });
  }
  // Log it on the CRM contact after the response — never slows or fails the form.
  after(() => recordFunnelEvent(admin, {
    fullName: clean.full_name as string, email: clean.email as string, phone: clean.phone as string,
    source: 'assessment', form: 'assessment', summary: 'Submitted the onboarding assessment', submissionId,
  }));
  return NextResponse.json({ ok: true });
}
