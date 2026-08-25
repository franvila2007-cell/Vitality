'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getProjections, computeMonthColors, STATUS_META, type GoalType } from '@/lib/progress';
import LoadingScreen from '@/components/LoadingScreen';
import WeightTrendGraph from '@/components/WeightTrendGraph';
import type { Database } from '@/lib/supabase/database.types';

type ClientProfile = Database['public']['Tables']['client_profiles']['Row'];
type Checkpoint = Database['public']['Tables']['weight_checkpoints']['Row'];

export default function ProgressClient() {
  // Memoized once — see TodayClient.tsx for why an unstable client instance
  // here would retrigger load()'s effect on every render.
  const [supabase] = useState(() => createClient());
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [newWeight, setNewWeight] = useState('');
  const [newMonth, setNewMonth] = useState(2);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [profRes, cpRes] = await Promise.all([
      supabase.from('client_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('weight_checkpoints').select('*').eq('user_id', user.id).order('month_index', { ascending: true }),
    ]);
    setProfile(profRes.data);
    setCheckpoints(cpRes.data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function saveCheckpoint() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !newWeight) return;
    await supabase.from('weight_checkpoints').upsert(
      { user_id: user.id, month_index: newMonth, weight: parseFloat(newWeight) },
      { onConflict: 'user_id,month_index' }
    );
    setNewWeight('');
    load();
  }

  if (loading) return <LoadingScreen />;
  if (!profile) return <div className="max-w-2xl mx-auto px-4 py-10 text-sm text-neutral-400">Your coach hasn&rsquo;t set up your program yet.</div>;

  const pace = (profile.pace_config as Record<string, number[]>)?.[profile.goal_type] || [1.5, 1.5, 1.5, 1.5, 1.5, 1.5];
  const months = [1, 2, 3, 4, 5, 6];
  const projections = getProjections(profile.start_weight, profile.goal_type as GoalType, pace);
  // Month 1 is just the start weight, not a separate checkpoint — displayed,
  // but never colored (nothing to compare it against yet), matching the
  // original app. Only months 2-6 have real checkpoints to judge on-track status.
  const actuals = months.map((m) => (m === 1 ? profile.start_weight : checkpoints.find((c) => c.month_index === m)?.weight ?? null));
  const colorActuals = months.map((m) => (m === 1 ? null : checkpoints.find((c) => c.month_index === m)?.weight ?? null));
  const colors = computeMonthColors(projections, colorActuals);
  const trendPoints = months
    .map((m, i) => ({ month: m, weight: actuals[i] }))
    .filter((p): p is { month: number; weight: number } => p.weight != null);

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4 page-fade-in">
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-sm font-medium mb-3">Weight progress</p>
        <div className="grid grid-cols-3 gap-2 text-center mb-4">
          <Stat label="Start" value={profile.start_weight} />
          <Stat label="Current" value={profile.current_weight} />
          <Stat label="Goal" value={profile.goal_weight} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {months.map((m, i) => (
            <div key={m} className={`rounded-lg border-l-4 px-2 py-2 text-center ${colors[i] ? STATUS_META[colors[i]!].cardClassName : 'border-l-neutral-200 bg-neutral-50 text-neutral-400'}`}>
              <div className="text-3xs uppercase tracking-wide opacity-70">Month {m}</div>
              <div className="text-sm font-semibold">{actuals[i] != null ? `${actuals[i]}kg` : `→${projections[i - 1] ?? profile.start_weight}kg`}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-sm font-medium mb-3">Weigh-in trend</p>
        <WeightTrendGraph points={trendPoints} goalWeight={profile.goal_weight} goalType={profile.goal_type as GoalType} />
      </div>

      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-sm font-medium mb-3">Log a monthly checkpoint</p>
        <div className="flex gap-2">
          <select value={newMonth} onChange={(e) => setNewMonth(Number(e.target.value))} className="flex-shrink-0 rounded-lg border border-border px-2 py-2 text-sm">
            {[2, 3, 4, 5, 6].map((m) => <option key={m} value={m}>Month {m}</option>)}
          </select>
          <input value={newWeight} onChange={(e) => setNewWeight(e.target.value)} type="number" step="0.1" placeholder="Weight (kg)" className="flex-1 min-w-0 rounded-lg border border-border px-3 py-2 text-sm" />
          <button onClick={saveCheckpoint} className="flex-shrink-0 rounded-lg bg-brand text-white px-4 py-2 text-sm font-medium transition-transform active:scale-95">Save</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-neutral-50 rounded-lg py-2">
      <div className="text-[10px] uppercase text-neutral-400">{label}</div>
      <div className="text-base font-medium">{value}kg</div>
    </div>
  );
}
