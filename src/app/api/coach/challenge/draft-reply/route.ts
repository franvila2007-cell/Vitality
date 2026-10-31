import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { draftReply } from '@/lib/challenge/draftReply';
import { loadChallengeMembers } from '@/lib/challenge/members';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Coach-only: drafts a personal WhatsApp reply to one check-in. The draft is
// only returned to the coach's screen to edit and copy — nothing is sent.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'coach') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { checkinId?: unknown } | null;
  const checkinId = typeof body?.checkinId === 'string' && UUID_RE.test(body.checkinId) ? body.checkinId : null;
  if (!checkinId) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const { members } = await loadChallengeMembers(supabase);
  const member = members.find((m) => m.checkins.some((c) => c.id === checkinId));
  const checkin = member?.checkins.find((c) => c.id === checkinId);
  if (!member || !checkin) return NextResponse.json({ error: 'Check-in not found.' }, { status: 404 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'The AI key (ANTHROPIC_API_KEY) is not set.' }, { status: 500 });

  try {
    const result = await draftReply(member, checkin);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ text: result.text });
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : null;
    console.error('challenge draft reply failed', status, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't reach the AI just now. Try again in a moment." }, { status: 502 });
  }
}
