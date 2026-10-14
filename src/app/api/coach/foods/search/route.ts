import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchOff } from '@/lib/vitto/offSearch';

export const runtime = 'nodejs';

// Coach-only: search Open Food Facts for a product to teach Vitto. Maltese
// products first, then by name. Returns real label values to prefill the form.
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'coach') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 3) return NextResponse.json({ results: [] });
  const hits = await searchOff(q, { limit: 25, timeoutMs: 5000 });
  const results = hits
    .sort((a, b) => Number(b.malta) - Number(a.malta))
    .slice(0, 10)
    .map((p) => ({ code: p.code, name: p.name, brand: p.brand, per100: p.per100, servingG: p.servingG, packG: p.packG, liquid: p.liquid, malta: p.malta }));
  return NextResponse.json({ results });
}
