import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processVittoMessage, parseFoodText, type VittoContext, type VittoAction, type MealEntry, type PendingState } from '@/lib/vitto/parser';
import type { FoodEntry } from '@/lib/vitto/foodDb';
import { llmAssistParse, llmEstimateFoods, llmEstimateFoodInsights, llmAnswerQuestion, type FoodInsight } from '@/lib/vitto/llmFallback';

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
    // perUnit, not per100g: a client-saved recipe/food's stored macros are
    // for ONE serving/piece as they described it ("Almond" = one almond,
    // "Yuho burger" = one burger) — treating that as "per 100g" silently
    // divides real portions down to near-zero (a saved 7 kcal almond became
    // "100g Almond = 7 kcal" instead of just 1 almond) and let quantity
    // words embedded in the food's own name (e.g. "1 Walnut Half") get
    // misread as a fraction modifier. Confirmed against a real client's
    // logged entries before fixing.
    db[cf.name] = { type: 'perUnit', cal: cf.calories, prot: cf.protein_g, carb: cf.carbs_g, fat: cf.fat_g, label: cf.name, avgGrams: cf.default_grams };
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

  // Hybrid fallback, two tiers — only reached when the local parser fully
  // failed on some/all of the message (it queued a "roughly how many
  // calories was that?" follow-up):
  //   1. Ask the LLM to normalize typos/slang, then re-run the SAME local,
  //      DB-grounded matcher on the cleaned text — cheap, and numbers stay
  //      exactly as curated in the coach's database.
  //   2. If the food still isn't in the database at all (a restaurant item,
  //      a home-cooked dish, a branded product), ask the LLM to estimate
  //      macros directly from its own nutrition knowledge — a genuine
  //      "knows about food" fallback rather than refusing. Always marked
  //      `estimated: true` with a capped confidence so it's visibly distinct
  //      from verified database numbers, never silently presented as exact.
  const pendingUnknownAction = result.actions.find((a): a is Extract<VittoAction, { kind: 'set_pending' }> => a.kind === 'set_pending' && a.pending.type === 'unknown_food');
  if (pendingUnknownAction && process.env.ANTHROPIC_API_KEY) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const originalPendingText = pendingUnknownAction.pending.type === 'unknown_food' ? pendingUnknownAction.pending.text : '';
    const nonPendingActions = result.actions.filter((a) => a !== pendingUnknownAction);

    const cleaned = await llmAssistParse(originalPendingText, apiKey);
    const llmMatched = cleaned ? parseFoodText(cleaned, ctx.foods).matched : [];

    if (llmMatched.length > 0) {
      const addActions: VittoAction[] = llmMatched.map((m) => ({ kind: 'add_meal', entry: { name: m.label, cal: m.cal, prot: m.prot, carb: m.carb, fat: m.fat, originalText: originalPendingText, matchedFood: m.matchedFood, amount: m.amount, unit: m.unit, estimated: true, confidence: Math.min(m.confidence, 0.85) } }));
      const totals = llmMatched.reduce((a, m) => ({ cal: a.cal + m.cal, prot: a.prot + m.prot, carb: a.carb + m.carb, fat: a.fat + m.fat }), { cal: 0, prot: 0, carb: 0, fat: 0 });
      const foodList = llmMatched.map((m) => m.label).join(' and ');
      result = {
        reply: result.reply.split(' I didn\'t recognise')[0] + ` (took a closer look) — ${foodList}, around ${Math.round(totals.cal)} kcal, ${Math.round(totals.prot)}g protein, ${Math.round(totals.carb)}g carbs, ${Math.round(totals.fat)}g fat. Added to today's log ✅`,
        actions: [...nonPendingActions, { kind: 'clear_pending' }, ...addActions],
      };
    } else {
      // Not a typo of anything in the database — genuinely unknown food.
      // Let the model estimate it directly rather than asking the client.
      const estimated = await llmEstimateFoods(originalPendingText, apiKey);
      if (estimated) {
        const addActions: VittoAction[] = estimated.map((it) => ({ kind: 'add_meal', entry: { name: it.label, cal: it.cal, prot: it.protein_g, carb: it.carbs_g, fat: it.fat_g, originalText: originalPendingText, matchedFood: null, amount: null, unit: null, estimated: true, confidence: 0.55 } }));
        const totals = estimated.reduce((a, it) => ({ cal: a.cal + it.cal, prot: a.prot + it.protein_g, carb: a.carb + it.carbs_g, fat: a.fat + it.fat_g }), { cal: 0, prot: 0, carb: 0, fat: 0 });
        const foodList = estimated.map((it) => it.label).join(' and ');
        result = {
          reply: result.reply.split(' I didn\'t recognise')[0] + ` — I don't have "${foodList}" in the database, but here's my best AI estimate: around ${Math.round(totals.cal)} kcal, ${Math.round(totals.prot)}g protein, ${Math.round(totals.carb)}g carbs, ${Math.round(totals.fat)}g fat. Added to today's log ✅ (flagged as an estimate, not a verified figure — let me know the real numbers if you have them).`,
          actions: [...nonPendingActions, { kind: 'clear_pending' }, ...addActions],
        };
      }
    }
  }

  // Genuine open question ("is peanut butter good for cutting?") rather than
  // a food to log — the local parser has no pattern for these at all, so
  // without this Vitto could only shrug, which is exactly what pushes
  // clients to ask a general chatbot instead.
  if (result.unhandled && process.env.ANTHROPIC_API_KEY) {
    const t = todayMeals.reduce((a, m) => ({ cal: a.cal + m.cal, prot: a.prot + m.prot, carb: a.carb + m.carb, fat: a.fat + m.fat }), { cal: 0, prot: 0, carb: 0, fat: 0 });
    const ctxSummary = `Client: ${firstName || 'this client'}. Today so far: ${Math.round(t.cal)}/${targets.cal} kcal, ${Math.round(t.prot)}/${targets.prot}g protein, ${Math.round(t.carb)}/${targets.carb}g carbs, ${Math.round(t.fat)}/${targets.fat}g fat. Current streak: ${streakDays} day(s).`;
    const answer = await llmAnswerQuestion(text, ctxSummary, process.env.ANTHROPIC_API_KEY);
    if (answer) result = { reply: answer, actions: result.actions };
  }

  await applyActions(supabase, user.id, date, result.actions, process.env.ANTHROPIC_API_KEY);

  const { data: freshMeals } = await supabase.from('food_log_entries').select('*').eq('user_id', user.id).eq('date', date).order('logged_at', { ascending: true });

  return NextResponse.json({ reply: result.reply, meals: freshMeals || [] });
}

async function applyActions(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, date: string, actions: VittoAction[], apiKey?: string) {
  // Batched once per message rather than per action — rates quality and
  // estimates a full micronutrient panel for every food logged this turn
  // (matched or estimated) in a single LLM call, so the rank's quality
  // component and micronutrient totals always have a real signal without a
  // call per item. Left null (excluded from rank/totals) if it fails or no
  // API key is configured.
  const addMealActions = actions.filter((a): a is Extract<VittoAction, { kind: 'add_meal' }> => a.kind === 'add_meal');
  let insights: (FoodInsight | null)[] = addMealActions.map(() => null);
  if (apiKey && addMealActions.length > 0) {
    const rated = await llmEstimateFoodInsights(addMealActions.map((a) => ({ name: a.entry.name, calories: a.entry.cal })), apiKey);
    if (rated) insights = rated;
  }

  let mealIdx = 0;
  for (const action of actions) {
    if (action.kind === 'add_meal') {
      const e = action.entry;
      const insight = insights[mealIdx];
      mealIdx++;
      await supabase.from('food_log_entries').insert({
        user_id: userId, date, name: e.name, calories: e.cal, protein_g: e.prot, carbs_g: e.carb, fat_g: e.fat,
        original_text: e.originalText ?? null, matched_food: e.matchedFood ?? null, amount: e.amount ?? null, unit: e.unit ?? null,
        estimated: e.estimated ?? false, confidence: e.confidence ?? null, source: 'chat',
        quality_score: insight?.quality_score ?? null,
        fiber_g: insight?.fiber_g ?? null, sugar_g: insight?.sugar_g ?? null, sodium_mg: insight?.sodium_mg ?? null,
        calcium_mg: insight?.calcium_mg ?? null, iron_mg: insight?.iron_mg ?? null, potassium_mg: insight?.potassium_mg ?? null,
        magnesium_mg: insight?.magnesium_mg ?? null, zinc_mg: insight?.zinc_mg ?? null,
        vitamin_a_mcg: insight?.vitamin_a_mcg ?? null, vitamin_c_mg: insight?.vitamin_c_mg ?? null, vitamin_d_mcg: insight?.vitamin_d_mcg ?? null,
        vitamin_e_mg: insight?.vitamin_e_mg ?? null, vitamin_k_mcg: insight?.vitamin_k_mcg ?? null,
        vitamin_b6_mg: insight?.vitamin_b6_mg ?? null, vitamin_b12_mcg: insight?.vitamin_b12_mcg ?? null, folate_mcg: insight?.folate_mcg ?? null,
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
