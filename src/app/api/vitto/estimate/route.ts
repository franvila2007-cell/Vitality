import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildVittoFoods } from '@/lib/vitto/buildFoods';
import { parseFoodText } from '@/lib/vitto/foodParser';
import { llmEstimateFoods } from '@/lib/vitto/llmFallback';

export const runtime = 'nodejs';

// "Work out the numbers for me" on the manual-add sheet: what does this food
// come to? Vitto's own food database first (exact for foods he knows, and he
// understands amounts: "200g rice", "2 slices of toast"), then an AI estimate
// for anything else. Nothing is saved here — it only fills the form.
export async function POST(req: Request) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: unknown };
  const q = typeof text === 'string' ? text.trim().slice(0, 200) : '';
  if (q.length < 2) return NextResponse.json({ error: 'Tell me what it was first.' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [globalRes, synonymsRes, customRes] = await Promise.all([
    supabase.from('foods_global').select('name, type, data'),
    supabase.from('food_synonyms').select('phrase, canonical'),
    supabase.from('custom_foods').select('*').eq('user_id', user.id),
  ]);
  const foods = buildVittoFoods(globalRes.data || [], synonymsRes.data || [], customRes.data || []);
  const parsed = parseFoodText(q, foods);
  if (parsed.matched.length > 0 && !parsed.needsLLM && parsed.unmatched.length === 0) {
    const sum = parsed.matched.reduce((a, m) => ({ cal: a.cal + m.cal, prot: a.prot + m.prot, carb: a.carb + m.carb, fat: a.fat + m.fat }), { cal: 0, prot: 0, carb: 0, fat: 0 });
    return NextResponse.json({
      source: 'database', label: parsed.matched.map((m) => m.label).join(' + '),
      cal: Math.round(sum.cal), prot: Math.round(sum.prot * 10) / 10, carb: Math.round(sum.carb * 10) / 10, fat: Math.round(sum.fat * 10) / 10,
      approx: parsed.matched.some((m) => m.estimated),
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const items = apiKey ? await llmEstimateFoods(q, apiKey) : null;
  if (!items) return NextResponse.json({ error: "I couldn't work that one out — type the numbers in if you know them." }, { status: 422 });
  const sum = items.reduce((a, m) => ({ cal: a.cal + m.cal, prot: a.prot + m.protein_g, carb: a.carb + m.carbs_g, fat: a.fat + m.fat_g }), { cal: 0, prot: 0, carb: 0, fat: 0 });
  return NextResponse.json({
    source: 'ai', label: items.map((m) => m.label).join(' + '),
    cal: Math.round(sum.cal), prot: Math.round(sum.prot * 10) / 10, carb: Math.round(sum.carb * 10) / 10, fat: Math.round(sum.fat * 10) / 10, approx: true,
  });
}
