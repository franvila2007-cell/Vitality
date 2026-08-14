import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseFoodText, type VittoFoods } from '@/lib/vitto/parser';
import type { FoodEntry } from '@/lib/vitto/foodDb';
import { llmAssistParse, llmEstimateFoods } from '@/lib/vitto/llmFallback';

export const runtime = 'nodejs';

// Sums macros for a free-text ingredient list using the same hybrid lookup
// Vitto's chat logging uses (local FOOD_DB + the client's own saved
// custom_foods first, LLM typo-cleanup/estimate fallback for anything
// unrecognized) — a "calculate from ingredients" assist for the recipe
// form, not a separate nutrition engine.
export async function POST(req: Request) {
  const { ingredientsText } = (await req.json()) as { ingredientsText?: string };
  if (!ingredientsText || !ingredientsText.trim()) return NextResponse.json({ error: 'ingredientsText is required' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [globalFoodsRes, synonymsRes, customFoodsRes] = await Promise.all([
    supabase.from('foods_global').select('name, type, data'),
    supabase.from('food_synonyms').select('phrase, canonical'),
    supabase.from('custom_foods').select('*').eq('user_id', user.id),
  ]);

  const db: Record<string, FoodEntry> = {};
  for (const row of globalFoodsRes.data || []) db[row.name] = { type: row.type, ...(row.data as object) } as FoodEntry;
  // perUnit, not per100g — see the matching comment in /api/vitto/message/route.ts.
  for (const cf of customFoodsRes.data || []) db[cf.name] = { type: 'perUnit', cal: cf.calories, prot: cf.protein_g, carb: cf.carbs_g, fat: cf.fat_g, label: cf.name, avgGrams: cf.default_grams };
  const synonyms: Record<string, string> = {};
  for (const s of synonymsRes.data || []) synonyms[s.phrase] = s.canonical;
  const foods: VittoFoods = { db, synonyms };

  type CalcItem = { label: string; cal: number; prot: number; carb: number; fat: number; estimated: boolean };

  // Ingredients are commonly listed one per line as well as comma/and-joined
  // on one line — normalize newlines to commas so parseFoodText's existing
  // splitter handles both.
  const normalized = ingredientsText.replace(/\r?\n/g, ', ');
  const first = parseFoodText(normalized, foods);
  let matched: CalcItem[] = first.matched.map((m) => ({ label: m.label, cal: m.cal, prot: m.prot, carb: m.carb, fat: m.fat, estimated: m.estimated }));
  let unmatched = first.unmatched;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (unmatched.length > 0 && apiKey) {
    for (const part of [...unmatched]) {
      const cleaned = await llmAssistParse(part, apiKey);
      const rematch = cleaned ? parseFoodText(cleaned, foods) : null;
      if (rematch && rematch.matched.length > 0) {
        matched = [...matched, ...rematch.matched.map((m) => ({ label: m.label, cal: m.cal, prot: m.prot, carb: m.carb, fat: m.fat, estimated: true }))];
        unmatched = unmatched.filter((u) => u !== part);
        continue;
      }
      const estimated = await llmEstimateFoods(part, apiKey);
      if (estimated) {
        matched = [...matched, ...estimated.map((it) => ({ label: it.label, cal: it.cal, prot: it.protein_g, carb: it.carbs_g, fat: it.fat_g, estimated: true }))];
        unmatched = unmatched.filter((u) => u !== part);
      }
    }
  }

  const totals = matched.reduce((a, m) => ({ cal: a.cal + m.cal, prot: a.prot + m.prot, carb: a.carb + m.carb, fat: a.fat + m.fat }), { cal: 0, prot: 0, carb: 0, fat: 0 });
  const items = matched.map((m) => ({ label: m.label, cal: Math.round(m.cal), prot: Math.round(m.prot), carb: Math.round(m.carb), fat: Math.round(m.fat), estimated: !!m.estimated }));

  return NextResponse.json({
    totals: { cal: Math.round(totals.cal), prot: Math.round(totals.prot), carb: Math.round(totals.carb), fat: Math.round(totals.fat) },
    items,
    unmatched,
  });
}
