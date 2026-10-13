import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Coach-only health check for Vitto's AI fallback: makes one tiny real call
// with the production key and reports exactly what came back — "working", or
// the error (invalid key, no credit, model not allowed...). Never returns the
// key itself. Open /api/coach/ai-check while signed in as the coach.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'coach') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, keyPresent: false, problem: 'ANTHROPIC_API_KEY is not set for this deployment — redeploy after adding it.' });
  }

  const started = Date.now();
  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create(
      { model: 'claude-haiku-4-5-20251001', max_tokens: 16, messages: [{ role: 'user', content: 'Reply with the single word: ok' }] },
      { timeout: 9000 },
    );
    const block = msg.content[0];
    return NextResponse.json({ ok: true, keyPresent: true, ms: Date.now() - started, reply: block?.type === 'text' ? block.text : null });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    const status = e.status ?? null;
    const hint =
      status === 401 ? 'The key was rejected — it is invalid, revoked or mistyped. Create a new key in the Anthropic console and paste it into Vercel.'
      : status === 400 && /credit/i.test(e.message ?? '') ? 'The Anthropic account is out of credit — add credit in the Anthropic console (Billing).'
      : status === 403 || status === 404 ? 'The key is not allowed to use this model, or the model name is wrong.'
      : status === 429 ? 'Rate-limited by Anthropic — usually temporary.'
      : 'Could not reach Anthropic or the call failed — see the message.';
    return NextResponse.json({ ok: false, keyPresent: true, status, problem: hint, message: (e.message ?? '').slice(0, 300) });
  }
}
