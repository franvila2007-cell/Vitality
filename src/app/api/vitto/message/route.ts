import { NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processVittoMessage, finishWithLLM, type VittoContext, type VittoAction, type MealEntry, type PendingState } from '@/lib/vitto/parser';
import { buildVittoFoods } from '@/lib/vitto/buildFoods';
import { llmParseFoodMessage, llmEstimateFoodInsights, llmAnswerQuestion } from '@/lib/vitto/llmFallback';

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

  const foods = buildVittoFoods(globalFoodsRes.data || [], synonymsRes.data || [], customFoodsRes.data || []);

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

  const ctx: VittoContext = { foods, todayMeals, targets, mealTemplates, streakDays, pending, clientFirstName: firstName };

  let result = processVittoMessage(text, ctx);

  // Understanding fallback — reached only when the local engine wasn't fully
  // confident about part of a food message (compound dishes, cafe orders,
  // brands, unfamiliar words, unknown foods). One LLM call reads those parts
  // like a person would; anything it maps onto a known food is re-computed
  // from the database numbers, the rest is flagged as an estimate. The local
  // best-effort result stands if the call fails or no key is configured.
  if (result.needsLLM && result.llmTexts && result.llmTexts.length > 0 && process.env.ANTHROPIC_API_KEY) {
    const items = await llmParseFoodMessage(result.llmTexts.join(', '), Object.keys(foods.db), process.env.ANTHROPIC_API_KEY);
    if (items && items.length > 0) {
      const merged = finishWithLLM(result, items, ctx, text);
      if (merged) result = merged;
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
  // Logging a food used to wait on an LLM call here (rating quality +
  // estimating a micronutrient panel) before the client saw anything —
  // meaning even a trivially-matched "3 eggs" paid for a full ~1-2s round
  // trip on every single log. Insert immediately with those fields null,
  // respond to the client right away, and backfill the rating afterward
  // via after() — it only feeds the quality-score ranking and
  // micronutrient panel, neither of which needs to be instant.
  const insertedMeals: { id: string; name: string; cal: number }[] = [];

  for (const action of actions) {
    if (action.kind === 'add_meal') {
      const e = action.entry;
      const { data: inserted } = await supabase.from('food_log_entries').insert({
        user_id: userId, date, name: e.name, calories: e.cal, protein_g: e.prot, carbs_g: e.carb, fat_g: e.fat,
        original_text: e.originalText ?? null, matched_food: e.matchedFood ?? null, amount: e.amount ?? null, unit: e.unit ?? null,
        estimated: e.estimated ?? false, confidence: e.confidence ?? null, source: 'chat',
      }).select('id').single();
      if (inserted) insertedMeals.push({ id: inserted.id, name: e.name, cal: e.cal });
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

  if (apiKey && insertedMeals.length > 0) {
    const admin = createAdminClient();
    after(async () => {
      const rated = await llmEstimateFoodInsights(insertedMeals.map((m) => ({ name: m.name, calories: m.cal })), apiKey);
      if (!rated) return;
      await Promise.all(insertedMeals.map((m, i) => {
        const insight = rated[i];
        if (!insight) return null;
        return admin.from('food_log_entries').update({
          quality_score: insight.quality_score ?? null,
          fiber_g: insight.fiber_g ?? null, sugar_g: insight.sugar_g ?? null, sodium_mg: insight.sodium_mg ?? null,
          calcium_mg: insight.calcium_mg ?? null, iron_mg: insight.iron_mg ?? null, potassium_mg: insight.potassium_mg ?? null,
          magnesium_mg: insight.magnesium_mg ?? null, zinc_mg: insight.zinc_mg ?? null,
          vitamin_a_mcg: insight.vitamin_a_mcg ?? null, vitamin_c_mg: insight.vitamin_c_mg ?? null, vitamin_d_mcg: insight.vitamin_d_mcg ?? null,
          vitamin_e_mg: insight.vitamin_e_mg ?? null, vitamin_k_mcg: insight.vitamin_k_mcg ?? null,
          vitamin_b6_mg: insight.vitamin_b6_mg ?? null, vitamin_b12_mcg: insight.vitamin_b12_mcg ?? null, folate_mcg: insight.folate_mcg ?? null,
        }).eq('id', m.id);
      }));
    });
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
