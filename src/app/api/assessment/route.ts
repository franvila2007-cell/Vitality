import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SECTIONS, isVisible, validateQuestion, type Answers } from '@/lib/assessment/questions';

const MAX_BODY_BYTES = 200_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public (no login): a brand-new client submits their onboarding assessment.
// Everything is re-validated here against the shared question schema — the
// browser's validation is only for UX. The insert uses the service-role key
// because the assessments table has no public insert policy (see
// supabase/migrations/0007_assessments.sql).
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Submission too large.' }, { status: 413 });

  let body: { submissionId?: unknown; answers?: unknown; confirmed?: unknown; company?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Honeypot: a hidden field real people never see. Bots that fill it get a
  // fake success so they don't retry.
  if (typeof body.company === 'string' && body.company.trim() !== '') return NextResponse.json({ ok: true });

  if (typeof body.submissionId !== 'string' || !UUID_RE.test(body.submissionId)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (body.confirmed !== true) {
    return NextResponse.json({ error: 'Please confirm your information is accurate.' }, { status: 400 });
  }
  if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const answers = body.answers as Answers;

  // Keep only known, visible, non-empty answers (so stale answers to
  // questions hidden by a later "No" aren't stored), trimmed.
  const errors: Record<string, string> = {};
  let firstErrorSection = -1;
  const clean: Answers = {};
  SECTIONS.forEach((section, i) => {
    for (const q of section.questions) {
      if (q.type === 'note' || !isVisible(q, answers)) continue;
      const err = validateQuestion(q, answers);
      if (err) {
        errors[q.id] = err;
        if (firstErrorSection === -1) firstErrorSection = i;
        continue;
      }
      const v = answers[q.id];
      if (Array.isArray(v)) { if (v.length) clean[q.id] = v; }
      else if (typeof v === 'string' && v.trim() !== '') clean[q.id] = v.trim();
    }
  });
  if (firstErrorSection !== -1) {
    return NextResponse.json({ error: 'Some answers need a quick look.', errors, section: firstErrorSection }, { status: 422 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('assessments').upsert(
    {
      submission_id: body.submissionId,
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
  return NextResponse.json({ ok: true });
}
