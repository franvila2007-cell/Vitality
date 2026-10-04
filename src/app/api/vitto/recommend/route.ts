import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildVittoFoods } from '@/lib/vitto/buildFoods';
import { recommendMeals } from '@/lib/vitto/mealRecommender';

export const runtime = 'nodejs';

type Body = { remaining?: { cal?: unknown; prot?: unknown; carb?: unknown; fat?: unknown }; hour?: unknown; date?: unknown; hasLogged?: unknown };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// "Vitto Recommends": the client sends what's left of today's targets (it
// already has them on screen), this resolves the meal ingredients against the
// same food database Vitto logs with and returns a ranked shortlist, so
// "Find Another Meal" can cycle through them with no further round trips.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const cal = num(body.remaining?.cal), prot = num(body.remaining?.prot), carb = num(body.remaining?.carb), fat = num(body.remaining?.fat);
  if (cal == null || prot == null || carb == null || fat == null) {
    return NextResponse.json({ error: 'remaining {cal, prot, carb, fat} is required' }, { status: 400 });
  }
  const hour = Math.min(23, Math.max(0, Math.floor(num(body.hour) ?? 12)));
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : 'x';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [globalRes, synonymsRes] = await Promise.all([
    supabase.from('foods_global').select('name, type, data'),
    supabase.from('food_synonyms').select('phrase, canonical'),
  ]);
  const foods = buildVittoFoods(globalRes.data || [], synonymsRes.data || [], []);

  const recommendation = recommendMeals({ cal, prot, carb, fat }, foods.db, { hour, seed: date, hasLogged: body.hasLogged !== false });
  return NextResponse.json(recommendation);
}
