import type { createClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type WeightProgress = {
  first: number; firstDate: string; latest: number; goal: number; goalType: 'lose' | 'gain';
  change: number; pctToGoal: number | null;
};

// 1-1 clients' weight, from their app program: the first weigh-in (start
// weight) against the latest one (most recent monthly check-in, else their
// current weight). Keyed by client (profile) id.
export async function weightProgress(supabase: ServerClient, clientIds: string[]): Promise<Map<string, WeightProgress>> {
  const out = new Map<string, WeightProgress>();
  if (clientIds.length === 0) return out;
  const [profilesRes, checkpointsRes] = await Promise.all([
    supabase.from('client_profiles').select('user_id, start_date, start_weight, current_weight, goal_weight, goal_type').in('user_id', clientIds),
    supabase.from('weight_checkpoints').select('user_id, month_index, weight').in('user_id', clientIds).order('month_index', { ascending: false }),
  ]);
  const latestCheckpoint = new Map<string, number>();
  // Newest check-in first; a blank (0kg) check-in isn't a real weigh-in.
  for (const c of checkpointsRes.data || []) {
    if (Number(c.weight) > 0 && !latestCheckpoint.has(c.user_id)) latestCheckpoint.set(c.user_id, Number(c.weight));
  }
  for (const p of profilesRes.data || []) {
    const first = Number(p.start_weight);
    if (!first) continue;
    const latest = latestCheckpoint.get(p.user_id) ?? (Number(p.current_weight) || first);
    const goal = Number(p.goal_weight);
    const span = goal - first;
    out.set(p.user_id, {
      first, firstDate: p.start_date, latest, goal, goalType: p.goal_type as 'lose' | 'gain',
      change: Math.round((latest - first) * 10) / 10,
      pctToGoal: goal && span ? Math.max(0, Math.min(100, Math.round(((latest - first) / span) * 100))) : null,
    });
  }
  return out;
}
