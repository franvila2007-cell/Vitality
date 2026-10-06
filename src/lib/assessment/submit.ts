import { NextResponse } from 'next/server';
import { cleanSubmission, type Answers, type Section } from '@/lib/assessment/questions';

const MAX_BODY_BYTES = 200_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shared request handling for the public (no login) form endpoints —
// /api/assessment and /api/meal-plan. Everything is re-validated here
// against the form's question schema; the browser's validation is only for
// UX. Returns either a response to send back as-is (bad request, honeypot,
// validation errors) or the cleaned answers ready to insert.
export async function parseFormSubmission(
  req: Request,
  sections: Section[]
): Promise<{ response: NextResponse } | { submissionId: string; clean: Answers }> {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return { response: NextResponse.json({ error: 'Submission too large.' }, { status: 413 }) };

  let body: { submissionId?: unknown; answers?: unknown; confirmed?: unknown; company?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return { response: NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) };
  }

  // Honeypot: a hidden field real people never see. Bots that fill it get a
  // fake success so they don't retry.
  if (typeof body.company === 'string' && body.company.trim() !== '') return { response: NextResponse.json({ ok: true }) };

  if (typeof body.submissionId !== 'string' || !UUID_RE.test(body.submissionId)) {
    return { response: NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) };
  }
  if (body.confirmed !== true) {
    return { response: NextResponse.json({ error: 'Please confirm your information is accurate.' }, { status: 400 }) };
  }
  if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
    return { response: NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) };
  }

  const { clean, errors, firstErrorSection } = cleanSubmission(sections, body.answers as Answers);
  if (firstErrorSection !== -1) {
    return { response: NextResponse.json({ error: 'Some answers need a quick look.', errors, section: firstErrorSection }, { status: 422 }) };
  }
  return { submissionId: body.submissionId, clean };
}
