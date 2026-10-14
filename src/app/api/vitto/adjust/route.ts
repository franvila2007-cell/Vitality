import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildVittoFoods } from '@/lib/vitto/buildFoods';
import { parseFoodText } from '@/lib/vitto/foodParser';
import { MICRONUTRIENT_KEYS } from '@/lib/micronutrients';
import type { Database } from '@/lib/supabase/database.types';

type EntryPatch = Database['public']['Tables']['food_log_entries']['Update'];

export const runtime = 'nodejs';

const SELECT = 'id, name, calories, protein_g, carbs_g, fat_g, amount, unit, matched_food, estimated';

// Changes the quantity of an entry already in today's log (the − / + on a
// logged-meal card). Known foods are re-resolved through the same engine that
// logged them, so labels and numbers come out exactly as if the client had
// typed the new amount; entries Vitto estimated (no matched food) are scaled
// proportionally instead. Only ever touches the signed-in client's own row.
export async function POST(req: Request) {
  const { id, amount } = (await req.json().catch(() => ({}))) as { id?: unknown; amount?: unknown };
  if (typeof id !== 'string' || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 5000) {
    return NextResponse.json({ error: 'id and a positive amount are required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: entry } = await supabase.from('food_log_entries').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (!entry) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const [globalRes, synonymsRes, customRes] = await Promise.all([
    supabase.from('foods_global').select('name, type, data'),
    supabase.from('food_synonyms').select('phrase, canonical'),
    supabase.from('custom_foods').select('*').eq('user_id', user.id),
  ]);
  const foods = buildVittoFoods(globalRes.data || [], synonymsRes.data || [], customRes.data || []);

  let patch: EntryPatch | null = null;
  if (entry.matched_food && foods.db[entry.matched_food]) {
    const measured = entry.unit === 'g' || entry.unit === 'ml';
    const cook = /\((raw|cooked)\)/.exec(entry.name)?.[1] ?? '';
    const text = `${measured ? `${amount}${entry.unit}` : String(amount)} ${entry.matched_food}${cook ? ' ' + cook : ''}`;
    const { matched } = parseFoodText(text, foods);
    if (matched.length === 1 && matched[0].matchedFood === entry.matched_food) {
      const n = matched[0];
      patch = { name: n.label, calories: n.cal, protein_g: n.prot, carbs_g: n.carb, fat_g: n.fat, amount: n.amount, unit: n.unit, estimated: n.estimated, confidence: n.confidence };
    }
  }

  const oldCal = Number(entry.calories) || 0;
  if (!patch) {
    // Estimated / unmatched entry: scale everything by the change in amount.
    const base = entry.amount != null && Number(entry.amount) > 0 ? Number(entry.amount) : null;
    if (!base) return NextResponse.json({ error: "this entry can't be resized" }, { status: 422 });
    const f = amount / base;
    const round1 = (v: number) => Math.round(v * 10) / 10;
    patch = {
      calories: Math.round(oldCal * f), protein_g: round1(Number(entry.protein_g) * f), carbs_g: round1(Number(entry.carbs_g) * f), fat_g: round1(Number(entry.fat_g) * f),
      amount, name: entry.name.replace(/^\d+(?:\.\d+)?/, String(Math.round(amount * 100) / 100)),
    };
  }

  // Keep the micronutrient estimates in proportion with the new portion.
  const newCal = Number(patch.calories) || 0;
  if (oldCal > 0 && newCal > 0) {
    const ratio = newCal / oldCal;
    for (const k of MICRONUTRIENT_KEYS) {
      const v = entry[k];
      if (typeof v === 'number') patch[k] = Math.round(v * ratio * 10) / 10;
    }
  }

  const { data: updated, error } = await supabase.from('food_log_entries').update(patch).eq('id', id).eq('user_id', user.id).select(SELECT).single();
  if (error || !updated) return NextResponse.json({ error: "couldn't update" }, { status: 500 });
  return NextResponse.json({ entry: updated });
}
