import type { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/database.types';
import { llmEstimateFoodInsights, MICRO_KEYS, type FoodInsight, type InsightsClient } from '@/lib/vitto/llmFallback';

type Admin = ReturnType<typeof createAdminClient>;
type EntryPatch = Database['public']['Tables']['food_log_entries']['Update'];

export function insightPatch(ins: FoodInsight): EntryPatch {
  const patch: EntryPatch = { quality_score: ins.quality_score };
  for (const k of MICRO_KEYS) patch[k] = ins[k] ?? null;
  return patch;
}

// Fills in the quality score + micronutrients of logged foods that still
// don't have them — the safety net behind the instant fill that happens right
// after logging (which can miss if the client closes the app, or the AI's
// answer was unusable). Oldest-blank-first isn't needed: newest first, a
// dozen at a time; throttled so repeated calls can't run up AI costs.
export async function runMicroBackfill(deps: {
  admin: Admin; apiKey: string; now?: Date; client?: InsightsClient;
  throttleMs?: number; limit?: number;
  /** tests only: restrict to one user's entries */
  onlyUser?: string;
}): Promise<{ checked: number; filled: number; skipped?: 'recent' }> {
  const { admin } = deps;
  const now = deps.now ?? new Date();
  const { data: s } = await admin.from('coach_settings').select('micro_backfill_last_run_at').eq('id', 1).maybeSingle();
  if (s?.micro_backfill_last_run_at && now.getTime() - new Date(s.micro_backfill_last_run_at).getTime() < (deps.throttleMs ?? 4 * 60000)) return { checked: 0, filled: 0, skipped: 'recent' };
  await admin.from('coach_settings').update({ micro_backfill_last_run_at: now.toISOString() }).eq('id', 1);

  let q = admin.from('food_log_entries').select('id, name, calories').is('quality_score', null)
    .lt('logged_at', new Date(now.getTime() - 2 * 60000).toISOString())
    .gte('logged_at', new Date(now.getTime() - 45 * 86400000).toISOString());
  if (deps.onlyUser) q = q.eq('user_id', deps.onlyUser);
  const { data: rows } = await q.order('logged_at', { ascending: false }).limit(deps.limit ?? 12);
  if (!rows || rows.length === 0) return { checked: 0, filled: 0 };

  const insights = await llmEstimateFoodInsights(rows.map((r) => ({ name: r.name, calories: r.calories })), deps.apiKey, deps.client);
  if (!insights) return { checked: rows.length, filled: 0 };
  let filled = 0;
  await Promise.all(rows.map(async (r, i) => {
    const ins = insights[i];
    if (!ins) return;
    // Only if still blank — never overwrite a rating the app has filled in meanwhile.
    const { error } = await admin.from('food_log_entries').update(insightPatch(ins)).eq('id', r.id).is('quality_score', null);
    if (!error) filled++;
  }));
  return { checked: rows.length, filled };
}
