import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processVittoMessage, parseFoodText, type VittoContext, type VittoAction, type MealEntry, type PendingState } from '@/lib/vitto/parser';
import type { FoodEntry } from '@/lib/vitto/foodDb';
import { llmAssistParse } from '@/lib/vitto/llmFallback';

export const runtime = 'nodejs';

function addDaysUTC(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const { text, date } = (await req.json()) as { text?: string; date?: string };
  if (!text || !text.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date (YYYY-MM-DD, client-local) is required' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [profileRes, globalFoodsRes, synonymsRes, customFoodsRes, targetsRes, templatesRes, pendingRes, todayMealsRes] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase.from('foods_global').select('name, type, data'),
    supabase.from('food_synonyms').select('phrase, canonical'),
    supabase.from('custom_foods').select('*').eq('user_id', user.id),
    supabase.from('targets').select('*').eq('user_id', user.id).single(),
    supabase.from('meal_templates').select('*').eq('user_id', user.id),
    supabase.from('chat_pending_state').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('food_log_entries').select('*').eq('user_id', user.id).eq('date', date).order('logged_at', { ascending: true }),
  ]);

  const db: Record<string, FoodEntry> = {};
  for (const row of globalFoodsRes.data || []) {
    db[row.name] = { type: row.type, ...(row.data as object) } as FoodEntry;
  }
  for (const cf of customFoodsRes.data || []) {
    db[cf.name] = { type: 'per100g', cal: cf.calories, prot: cf.protein_g, carb: cf.carbs_g, fat: cf.fat_g, defaultGrams: cf.default_grams };
  }
  const synonyms: Record<string, string> = {};
  for (const s of synonymsRes.data || []) synonyms[s.phrase] = s.canonical;

  const todayMeals: MealEntry[] = (todayMealsRes.data || []).map((m) => ({
    id: m.id, name: m.name, cal: m.calories, prot: m.protein_g, carb: m.carbs_g, fat: m.fat_g,
    originalText: m.original_text, matchedFood: m.matched_food, amount: m.amount, unit: m.unit,
    estimated: m.estimated, confidence: m.confidence ?? undefined,
  }));

  const targets = targetsRes.data
    ? { cal: targetsRes.data.calories, prot: targetsRes.data.protein_g, carb: targetsRes.data.carbs_g, fat: targetsRes.data.fat_g }
    : { cal: 2000, prot: 150, carb: 200, fat: 65 };

  const mealTemplates = (templatesRes.data || []).map((t) => ({ id: t.id, name: t.name, cal: t.calories, prot: t.protein_g, carb: t.carbs_g, fat: t.fat_g, mealtime: t.mealtime }));

  let pending: PendingState | null = null;
  if (pendingRes.data) {
    const payload = pendingRes.data.payload as Record<string, unknown>;
    if (pendingRes.data.pending_type === 'unknown_food') pending = { type: 'unknown_food', text: String(payload.text ?? '') };
    else if (pendingRes.data.pending_type === 'mealtime_options') pending = { type: 'mealtime_options', templateIds: (payload.templateIds as string[]) ?? [] };
  }

  const streakDays = await computeStreak(supabase, user.id, date);

  const firstName = profileRes.data?.full_name?.trim().split(/\s+/)[0] || null;

  const ctx: VittoContext = { foods: { db, synonyms }, todayMeals, targets, mealTemplates, streakDays, pending, clientFirstName: firstName };

  let result = processVittoMessage(text, ctx);

  // Hybrid fallback: local parser fully failed on some/all of the message
  // (it queued a "roughly how many calories was that?" follow-up) — try the
  // LLM to normalize the phrasing, then re-run the SAME local, DB-grounded
  // matcher on the cleaned text before giving up and asking the client.
  const pendingUnknownAction = result.actions.find((a): a is Extract<VittoAction, { kind: 'set_pending' }> => a.kind === 'set_pending' && a.pending.type === 'unknown_food');
  if (pendingUnknownAction && process.env.ANTHROPIC_API_KEY) {
    const originalPendingText = pendingUnknownAction.pending.type === 'unknown_food' ? pendingUnknownAction.pending.text : '';
    const cleaned = await llmAssistParse(originalPendingText, process.env.ANTHROPIC_API_KEY);
    if (cleaned) {
      const { matched: llmMatched } = parseFoodText(cleaned, ctx.foods);
      if (llmMatched.length > 0) {
        const addActions: VittoAction[] = llmMatched.map((m) => ({ kind: 'add_meal', entry: { name: m.label, cal: m.cal, prot: m.prot, carb: m.carb, fat: m.fat, originalText: originalPendingText, matchedFood: m.matchedFood, amount: m.amount, unit: m.unit, estimated: true, confidence: Math.min(m.confidence, 0.85) } }));
        const totals = llmMatched.reduce((a, m) => ({ cal: a.cal + m.cal, prot: a.prot + m.prot, carb: a.carb + m.carb, fat: a.fat + m.fat }), { cal: 0, prot: 0, carb: 0, fat: 0 });
        const foodList = llmMatched.map((m) => m.label).join(' and ');
        const nonPendingActions = result.actions.filter((a) => a !== pendingUnknownAction);
        result = {
          reply: result.reply.split(' I didn\'t recognise')[0] + ` (took a closer look) — ${foodList}, around ${Math.round(totals.cal)} kcal, ${Math.round(totals.prot)}g protein, ${Math.round(totals.carb)}g carbs, ${Math.round(totals.fat)}g fat. Added to today's log ✅`,
          actions: [...nonPendingActions, { kind: 'clear_pending' }, ...addActions],
        };
      }
    }
  }

  await applyActions(supabase, user.id, date, result.actions);

  const { data: freshMeals } = await supabase.from('food_log_entries').select('*').eq('user_id', user.id).eq('date', date).order('logged_at', { ascending: true });

  return NextResponse.json({ reply: result.reply, meals: freshMeals || [] });
}

async function applyActions(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, date: string, actions: VittoAction[]) {
  for (const action of actions) {
    if (action.kind === 'add_meal') {
      const e = action.entry;
      await supabase.from('food_log_entries').insert({
        user_id: userId, date, name: e.name, calories: e.cal, protein_g: e.prot, carbs_g: e.carb, fat_g: e.fat,
        original_text: e.originalText ?? null, matched_food: e.matchedFood ?? null, amount: e.amount ?? null, unit: e.unit ?? null,
        estimated: e.estimated ?? false, confidence: e.confidence ?? null, source: 'chat',
      });
    } else if (action.kind === 'remove_meal') {
      await supabase.from('food_log_entries').delete().eq('id', action.id).eq('user_id', userId);
    } else if (action.kind === 'clear_meals') {
      await supabase.from('food_log_entries').delete().eq('user_id', userId).eq('date', date);
    } else if (action.kind === 'set_pending') {
      const payload = action.pending.type === 'unknown_food' ? { text: action.pending.text } : { templateIds: action.pending.templateIds };
      await supabase.from('chat_pending_state').upsert({ user_id: userId, pending_type: action.pending.type, payload });
    } else if (action.kind === 'clear_pending') {
      await supabase.from('chat_pending_state').delete().eq('user_id', userId);
    }
  }
}

// Ported from computeDailyStreak() in the original app: a day counts only if
// it has >=1 logged meal AND >=1 completed habit; walk backward from `date`
// until the first day that fails either condition.
async function computeStreak(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, date: string): Promise<number> {
  const windowStart = addDaysUTC(date, -90);
  const [mealDatesRes, habitDatesRes] = await Promise.all([
    supabase.from('food_log_entries').select('date').eq('user_id', userId).gte('date', windowStart).lte('date', date),
    supabase.from('habit_completions').select('date').eq('user_id', userId).eq('completed', true).gte('date', windowStart).lte('date', date),
  ]);
  const mealDates = new Set((mealDatesRes.data || []).map((r) => r.date));
  const habitDates = new Set((habitDatesRes.data || []).map((r) => r.date));

  let streak = 0;
  let cursor = date;
  while (mealDates.has(cursor) && habitDates.has(cursor)) {
    streak++;
    cursor = addDaysUTC(cursor, -1);
  }
  return streak;
}
