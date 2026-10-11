import { NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SECTIONS } from '@/lib/assessment/questions';
import { parseFormSubmission } from '@/lib/assessment/submit';
import { recordFunnelEvent } from '@/lib/crm/ingest';
import { heardInfo } from '@/lib/crm/heard';

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
  const heard = heardInfo(clean);
  after(() => recordFunnelEvent(admin, {
    fullName: clean.full_name as string, email: clean.email as string, phone: clean.phone as string,
    source: 'assessment', form: 'assessment', submissionId,
    summary: `Submitted the onboarding assessment${heard.phrase ? ` · ${heard.phrase}` : ''}`,
    contactSource: heard.source, extra: heard.extra,
  }));
  return NextResponse.json({ ok: true });
}
