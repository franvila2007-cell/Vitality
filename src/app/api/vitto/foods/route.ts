import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildVittoFoods } from '@/lib/vitto/buildFoods';

export const runtime = 'nodejs';

// Food names for the as-you-type suggestions in Vitto's message box: every
// food Vitto knows (built-ins, brands, the coach's database) plus this
// client's own saved recipes. Names only — a few KB, cached by the browser.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [globalRes, synonymsRes, customRes] = await Promise.all([
    supabase.from('foods_global').select('name, type, data'),
    supabase.from('food_synonyms').select('phrase, canonical'),
    supabase.from('custom_foods').select('*').eq('user_id', user.id),
  ]);
  const foods = buildVittoFoods(globalRes.data || [], synonymsRes.data || [], customRes.data || []);
  const names = Object.keys(foods.db).filter((n) => n.length >= 3 && n.length <= 40).sort((a, b) => a.length - b.length || a.localeCompare(b));
  return NextResponse.json({ names }, { headers: { 'Cache-Control': 'private, max-age=600' } });
}
