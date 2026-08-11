import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TargetsEditor from '@/components/coach/TargetsEditor';
import RankOverride from '@/components/coach/RankOverride';
import { computeDayRank, RANK_META } from '@/lib/ranking';

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'coach') redirect('/');

  const [profileRes, clientProfileRes, targetsRes, checkpointsRes, historyRes, habitsRes, habitCompletionsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).single(),
    supabase.from('client_profiles').select('*').eq('user_id', id).maybeSingle(),
    supabase.from('targets').select('*').eq('user_id', id).maybeSingle(),
    supabase.from('weight_checkpoints').select('*').eq('user_id', id).order('month_index'),
    supabase.from('food_log_entries').select('date, name, calories, protein_g, carbs_g, fat_g, quality_score, estimated').eq('user_id', id).order('date', { ascending: false }).limit(500),
    supabase.from('habits').select('id').eq('user_id', id),
    // Retroactively scoring past days assumes today's habit list and targets
    // applied then too — a reasonable approximation, since this app doesn't
    // track historical versions of either.
    supabase.from('habit_completions').select('date').eq('user_id', id).eq('completed', true).order('date', { ascending: false }).limit(2000),
  ]);

  if (profileRes.error || !profileRes.data) notFound();
  const clientProfile = clientProfileRes.data;
  const targets = targetsRes.data;
  const habitsTotal = habitsRes.data?.length ?? 0;
  const rankTargets = targets ? { calories: targets.calories, protein_g: targets.protein_g, carbs_g: targets.carbs_g, fat_g: targets.fat_g } : null;

  const habitsDoneByDate = new Map<string, number>();
  for (const row of habitCompletionsRes.data || []) {
    habitsDoneByDate.set(row.date, (habitsDoneByDate.get(row.date) ?? 0) + 1);
  }

  type DayMeal = { name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; quality_score: number | null; estimated: boolean };
  const mealsByDate = new Map<string, DayMeal[]>();
  for (const row of historyRes.data || []) {
    const arr = mealsByDate.get(row.date) || [];
    arr.push({ name: row.name, calories: row.calories, protein_g: row.protein_g, carbs_g: row.carbs_g, fat_g: row.fat_g, quality_score: row.quality_score, estimated: row.estimated });
    mealsByDate.set(row.date, arr);
  }
  const historyDates = [...mealsByDate.keys()].sort((a, b) => (a < b ? 1 : -1)).slice(0, 30);
  const historyDays = historyDates.map((date) => {
    const meals = mealsByDate.get(date)!;
    const t = meals.reduce((a, m) => ({ cal: a.cal + m.calories, prot: a.prot + m.protein_g, carb: a.carb + m.carbs_g, fat: a.fat + m.fat_g }), { cal: 0, prot: 0, carb: 0, fat: 0 });
    const rank = computeDayRank({ habitsTotal, habitsDone: habitsDoneByDate.get(date) ?? 0, meals, targets: rankTargets }).rank;
    return { date, t, count: meals.length, rank };
  });

  const latestDate = historyRes.data?.[0]?.date ?? null;
  let rankBreakdown = null as ReturnType<typeof computeDayRank> | null;
  let currentOverride: 'gold' | 'silver' | 'bronze' | null = null;
  if (latestDate) {
    const overrideRes = await supabase.from('rank_overrides').select('rank').eq('user_id', id).eq('date', latestDate).maybeSingle();
    rankBreakdown = computeDayRank({ habitsTotal, habitsDone: habitsDoneByDate.get(latestDate) ?? 0, meals: mealsByDate.get(latestDate) ?? [], targets: rankTargets });
    currentOverride = overrideRes.data?.rank ?? null;
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-10 bg-surface border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center">
          <Link href="/coach" className="text-sm text-neutral-400 hover:text-neutral-700">&larr; Clients</Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-medium">{profileRes.data.full_name || profileRes.data.email}</h1>
          <p className="text-sm text-neutral-400">{profileRes.data.email}</p>
        </div>

        {clientProfile ? (
          <div className="bg-surface border border-border rounded-2xl p-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="Start" value={`${clientProfile.start_weight}kg`} />
            <Stat label="Current" value={`${clientProfile.current_weight}kg`} />
            <Stat label="Goal" value={`${clientProfile.goal_weight}kg (${clientProfile.goal_type})`} />
          </div>
        ) : (
          <p className="text-sm text-neutral-400">No program set up for this client yet.</p>
        )}

        {checkpointsRes.data && checkpointsRes.data.length > 0 && (
          <div className="bg-surface border border-border rounded-2xl p-4">
            <p className="text-sm font-medium mb-2">Weight checkpoints</p>
            <div className="flex gap-3 flex-wrap">
              {checkpointsRes.data.map((c) => (
                <span key={c.id} className="text-xs bg-neutral-50 rounded-full px-3 py-1">Month {c.month_index}: {c.weight}kg</span>
              ))}
            </div>
          </div>
        )}

        <TargetsEditor userId={id} initial={targets} />

        {latestDate && (mealsByDate.get(latestDate)?.length ?? 0) > 0 && (
          <div className="bg-surface border border-border rounded-2xl p-4">
            <p className="text-sm font-medium mb-3">What they ate · {latestDate}</p>
            <FoodList meals={mealsByDate.get(latestDate)!} />
          </div>
        )}

        {rankBreakdown && latestDate && (
          <RankOverride userId={id} date={latestDate} breakdown={rankBreakdown} initialOverride={currentOverride} />
        )}

        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-sm font-medium mb-3">Daily intake history</p>
          {historyDays.length === 0 && <p className="text-sm text-neutral-400">No entries logged yet.</p>}
          <div className="flex flex-col divide-y divide-border">
            {historyDays.map(({ date, t, count, rank }) => (
              <details key={date} className="group py-2">
                <summary className="flex items-center justify-between text-sm gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <span className="text-neutral-500 flex-shrink-0">{date}</span>
                  <span className="text-neutral-700 flex-1 min-w-0 truncate text-right">{Math.round(t.cal)} kcal · {Math.round(t.prot)}p {Math.round(t.carb)}c {Math.round(t.fat)}f</span>
                  <span className="text-[11px] text-neutral-400 flex-shrink-0">{count} {count === 1 ? 'entry' : 'entries'}</span>
                  <span className="flex-shrink-0" title={RANK_META[rank].label}>{RANK_META[rank].emoji}</span>
                </summary>
                <div className="mt-2 pl-1">
                  <FoodList meals={mealsByDate.get(date) ?? []} />
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-50 rounded-lg py-2">
      <div className="text-[10px] uppercase text-neutral-400">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function qualityColor(score: number | null): string {
  if (score == null) return 'text-neutral-300';
  if (score >= 70) return 'text-emerald-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-500';
}

function FoodList({ meals }: { meals: { name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; quality_score: number | null; estimated: boolean }[] }) {
  if (meals.length === 0) return <p className="text-sm text-neutral-400">No entries.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {meals.map((m, i) => (
        <div key={i} className="flex items-center gap-2 bg-neutral-50 rounded-lg px-3 py-2 text-sm">
          <span className="flex-1 min-w-0 truncate">{m.name}{m.estimated && <span className="text-neutral-400"> (est.)</span>}</span>
          <span className="flex-shrink-0 text-[11px] text-neutral-400 whitespace-nowrap">{Math.round(m.calories)} kcal · {Math.round(m.protein_g)}p {Math.round(m.carbs_g)}c {Math.round(m.fat_g)}f</span>
          <span className={`flex-shrink-0 text-[11px] font-medium w-8 text-right ${qualityColor(m.quality_score)}`} title="Food quality score">
            {m.quality_score ?? '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
