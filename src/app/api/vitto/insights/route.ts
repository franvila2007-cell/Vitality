import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { llmEstimateFoodInsights, MICRO_KEYS } from '@/lib/vitto/llmFallback';
import type { Database } from '@/lib/supabase/database.types';

type EntryPatch = Database['public']['Tables']['food_log_entries']['Update'];

export const runtime = 'nodejs';

// Adds the quality score and micronutrient estimate to entries that don't have
// one yet — manually typed foods, a recommended meal, anything logged without
// going through chat (chat entries get theirs in the background already).
// Only ever touches the signed-in client's own entries.
export async function POST(req: Request) {
  const { ids } = (await req.json().catch(() => ({}))) as { ids?: unknown };
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 12 || !ids.every((i) => typeof i === 'string')) {
    return NextResponse.json({ error: 'ids (1-12) are required' }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'micronutrient estimates are unavailable right now' }, { status: 503 });

  const { data: rows } = await supabase.from('food_log_entries').select('id, name, calories').eq('user_id', user.id).in('id', ids as string[]).is('quality_score', null);
  if (!rows || rows.length === 0) return NextResponse.json({ entries: [] });

  const insights = await llmEstimateFoodInsights(rows.map((r) => ({ name: r.name, calories: r.calories })), apiKey);
  if (!insights) return NextResponse.json({ error: "couldn't estimate micronutrients" }, { status: 502 });

  const updated = await Promise.all(rows.map(async (r, i) => {
    const ins = insights[i];
    if (!ins) return null;
    const patch: EntryPatch = { quality_score: ins.quality_score };
    for (const k of MICRO_KEYS) patch[k] = ins[k] ?? null;
    const { data } = await supabase.from('food_log_entries').update(patch).eq('id', r.id).eq('user_id', user.id).select('*').single();
    return data;
  }));
  return NextResponse.json({ entries: updated.filter(Boolean) });
}
