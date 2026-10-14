import { createClient } from '@/lib/supabase/server';
import FoodsManager, { type TaughtFood } from '@/components/coach/FoodsManager';

// "Teach Vitto": brands and products the coach adds (or Vitto learned from
// Open Food Facts), kept in the shared foods database so every client's Vitto
// recognises them with real label numbers. Coach-role guard lives in
// coach/layout.tsx; writes are coach-only via RLS too.
export default async function CoachFoodsPage() {
  const supabase = await createClient();
  const [{ data: foods }, { data: synonyms }] = await Promise.all([
    supabase.from('foods_global').select('name, type, data').or('data->>taught.eq.true,data->>learned.eq.true').order('name').limit(1000),
    supabase.from('food_synonyms').select('phrase, canonical').limit(5000),
  ]);
  const aliasesBy = new Map<string, string[]>();
  for (const s of synonyms || []) aliasesBy.set(s.canonical, [...(aliasesBy.get(s.canonical) ?? []), s.phrase]);
  const rows: TaughtFood[] = (foods || []).map((f) => ({ name: f.name, type: f.type, data: f.data as Record<string, unknown>, aliases: aliasesBy.get(f.name) ?? [] }));

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 page-fade-in">
      <h1 className="text-h1 font-semibold">Teach Vitto</h1>
      <p className="text-2xs text-neutral-400 mb-5">Brands and products — Maltese ones especially — with their real label numbers, for every client</p>
      <FoodsManager rows={rows} />
    </div>
  );
}
