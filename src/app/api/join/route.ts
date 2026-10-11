import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseFormSubmission } from '@/lib/assessment/submit';
import { recordFunnelEvent } from '@/lib/crm/ingest';
import { JOIN_SECTIONS, HEARD_TO_SOURCE } from '@/lib/crm/joinQuestions';
import { SOURCE_META } from '@/lib/crm/constants';

// Public (no login) lead form at /join. The submission lives only in the CRM:
// a contact (new or existing, by email) plus a timeline entry with the
// answers. ?src= on the link (e.g. /join?src=instagram) tags the source.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const parsed = await parseFormSubmission(req, JOIN_SECTIONS);
  if ('response' in parsed) return parsed.response;
  const { submissionId, clean } = parsed;

  const src = url.searchParams.get('src') || '';
  const source = SOURCE_META[src] ? src : HEARD_TO_SOURCE[clean.heard as string] ?? 'join_form';

  // Awaited (not after()): this is the only place the lead is stored.
  const ok = await recordFunnelEvent(createAdminClient(), {
    fullName: clean.full_name as string, email: clean.email as string, phone: clean.phone as string,
    source, form: 'join', submissionId,
    summary: [`Joined via the website form · ${clean.interest} · ${clean.goal}`, clean.message ? `“${clean.message}”` : ''].filter(Boolean).join('\n'),
    extra: { answers: clean, src: src || null },
  });
  if (!ok) return NextResponse.json({ error: "We couldn't send your details. Please try again in a moment." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
