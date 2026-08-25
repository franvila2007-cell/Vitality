import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { addDays } from '@/lib/date';
import { getProjections, computeMonthColors, STATUS_META, type GoalType } from '@/lib/progress';
import { computeDayRank, RANK_META } from '@/lib/ranking';
import RestoreClientButton from '@/components/coach/RestoreClientButton';
import DeleteForeverButton from '@/components/coach/DeleteForeverButton';
import PrefetchOnIntentLink from '@/components/PrefetchOnIntentLink';

// Auth/role guard and the top header bar now live in coach/layout.tsx.
export default async function CoachPage() {
  const supabase = await createClient();

  const { data: clients } = await supabase.from('profiles').select('id, full_name, email').eq('role', 'client').is('archived_at', null).order('full_name');
  const { data: archivedClients } = await supabase.from('profiles').select('id, full_name, email').eq('role', 'client').not('archived_at', 'is', null).order('full_name');

  const serverToday = new Date().toISOString().slice(0, 10);
  const weekStart = addDays(serverToday, -6);

  const rows = await Promise.all(
    (clients || []).map(async (c) => {
      const [profRes, targetsRes, recentMealsRes, cpRes, habitsRes, weekMealsRes, weekCompletionsRes, weekOverridesRes] = await Promise.all([
        supabase.from('client_profiles').select('*').eq('user_id', c.id).maybeSingle(),
        supabase.from('targets').select('*').eq('user_id', c.id).maybeSingle(),
        // Server time and a client's own local "today" can disagree by a day
        // right around midnight, so rather than filtering on the server's
        // UTC date directly, pull recent rows and use whichever date is
        // actually the client's most recent — that's always the day they'd
        // call "today" themselves.
        supabase.from('food_log_entries').select('date, calories, protein_g, carbs_g, fat_g, quality_score').eq('user_id', c.id).order('date', { ascending: false }).limit(100),
        supabase.from('weight_checkpoints').select('*').eq('user_id', c.id),
        supabase.from('habits').select('id').eq('user_id', c.id),
        // Separate, explicitly date-bounded queries for the weekly gold
        // count — the recentMeals query above intentionally has no date
        // filter (so an inactive client's last-ever entry still surfaces),
        // which wouldn't reliably cover "the last 7 days" for clients who
        // log many times a day.
        supabase.from('food_log_entries').select('date, calories, protein_g, carbs_g, fat_g, quality_score').eq('user_id', c.id).gte('date', weekStart).lte('date', serverToday),
        supabase.from('habit_completions').select('date').eq('user_id', c.id).eq('completed', true).gte('date', weekStart).lte('date', serverToday),
        supabase.from('rank_overrides').select('date, rank').eq('user_id', c.id).gte('date', weekStart).lte('date', serverToday),
      ]);
      const latestDate = recentMealsRes.data?.[0]?.date ?? null;
      const latestMeals = (recentMealsRes.data || []).filter((m) => m.date === latestDate);
      const totals = latestMeals.reduce((a, m) => ({ cal: a.cal + m.calories, prot: a.prot + m.protein_g, carb: a.carb + m.carbs_g, fat: a.fat + m.fat_g }), { cal: 0, prot: 0, carb: 0, fat: 0 });

      let status: 'green' | 'orange' | 'red' | null = null;
      if (profRes.data) {
        const pace = (profRes.data.pace_config as Record<string, number[]>)?.[profRes.data.goal_type] || [1.5, 1.5, 1.5, 1.5, 1.5, 1.5];
        const projections = getProjections(profRes.data.start_weight, profRes.data.goal_type as GoalType, pace);
        // Month 1 is the start weight, not a real checkpoint — never colored (see ProgressClient).
        const colorActuals = [1, 2, 3, 4, 5, 6].map((m) => (m === 1 ? null : cpRes.data?.find((cp) => cp.month_index === m)?.weight ?? null));
        const colors = computeMonthColors(projections, colorActuals);
        status = [...colors].reverse().find((c) => c !== null) || null;
      }

      const habitsTotal = habitsRes.data?.length ?? 0;
      const rankTargets = targetsRes.data ? { calories: targetsRes.data.calories, protein_g: targetsRes.data.protein_g, carbs_g: targetsRes.data.carbs_g, fat_g: targetsRes.data.fat_g } : null;
      const weekMealsByDate = new Map<string, { calories: number; protein_g: number; carbs_g: number; fat_g: number; quality_score: number | null }[]>();
      for (const m of weekMealsRes.data || []) {
        const arr = weekMealsByDate.get(m.date) || [];
        arr.push(m);
        weekMealsByDate.set(m.date, arr);
      }
      const weekHabitsDoneByDate = new Map<string, number>();
      for (const row of weekCompletionsRes.data || []) {
        weekHabitsDoneByDate.set(row.date, (weekHabitsDoneByDate.get(row.date) ?? 0) + 1);
      }
      const weekOverrideByDate = new Map((weekOverridesRes.data || []).map((r) => [r.date, r.rank]));

      let rank = null as ReturnType<typeof computeDayRank>['rank'] | null;
      let rankOverridden = false;
      if (latestDate) {
        // latestDate is almost always within the 7-day window already
        // fetched above — only fire a dedicated round trip for the rarer
        // case of a client whose last-ever entry is older than that.
        let habitsDone: number;
        let override: 'gold' | 'silver' | 'bronze' | undefined;
        if (latestDate >= weekStart) {
          habitsDone = weekHabitsDoneByDate.get(latestDate) ?? 0;
          override = weekOverrideByDate.get(latestDate);
        } else {
          const [completionsRes, overrideRes] = await Promise.all([
            supabase.from('habit_completions').select('habit_id').eq('user_id', c.id).eq('date', latestDate).eq('completed', true),
            supabase.from('rank_overrides').select('rank').eq('user_id', c.id).eq('date', latestDate).maybeSingle(),
          ]);
          habitsDone = completionsRes.data?.length ?? 0;
          override = overrideRes.data?.rank;
        }
        const breakdown = computeDayRank({
          habitsTotal, habitsDone,
          meals: latestMeals.map((m) => ({ calories: m.calories, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g, quality_score: m.quality_score })),
          targets: rankTargets,
        });
        rank = override ?? breakdown.rank;
        rankOverridden = !!override;
      }

      // Weekly golds: same rank logic as "today," applied to each of the
      // last 7 days — a coach-confirmed override wins where one exists,
      // otherwise fall back to the computed breakdown for that day.
      let weeklyGolds = 0;
      for (let i = 0; i <= 6; i++) {
        const d = addDays(serverToday, -i);
        const dayMeals = weekMealsByDate.get(d) || [];
        if (dayMeals.length === 0 && !weekHabitsDoneByDate.has(d) && !weekOverrideByDate.has(d)) continue;
        const dayRank = weekOverrideByDate.get(d) ?? computeDayRank({ habitsTotal, habitsDone: weekHabitsDoneByDate.get(d) ?? 0, meals: dayMeals, targets: rankTargets }).rank;
        if (dayRank === 'gold') weeklyGolds++;
      }

      return { client: c, profile: profRes.data, targets: targetsRes.data, totals, status, latestDate, rank, rankOverridden, weeklyGolds };
    })
  );

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 py-6 page-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-h1 font-semibold">Clients ({rows.length})</h1>
          <Link href="/coach/clients/new" className="rounded-lg bg-brand text-white px-4 py-2 text-sm font-medium hover:opacity-90">+ Add client</Link>
        </div>

        {rows.length === 0 && <p className="text-sm text-neutral-400">No clients yet — add your first one.</p>}

        <div className="flex flex-col gap-2">
          {rows.map(({ client, profile, targets, totals, status, latestDate, rank, rankOverridden, weeklyGolds }) => (
            <PrefetchOnIntentLink
              key={client.id}
              href={`/coach/clients/${client.id}`}
              // Each client's detail page independently runs ~10 Supabase
              // queries (500-row food history, 2000-row habit history,
              // checkpoints, overrides...) — default prefetch would fire all
              // of them for every client the instant this list renders, not
              // just the one the coach taps, so this only prefetches on
              // real touch/hover intent for that one link.
              className="flex flex-col gap-2 bg-surface border border-border rounded-xl px-4 py-3 hover:border-brand transition-colors overflow-hidden"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${status ? STATUS_META[status].dotClassName : 'bg-neutral-300'}`}
                  title={status || 'no data yet'}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{client.full_name || client.email}</p>
                  <p className="text-xs text-neutral-400 truncate">
                    {profile ? `${profile.goal_type === 'lose' ? 'Losing' : 'Gaining'} to ${profile.goal_weight}kg` : 'No program set up'}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium whitespace-nowrap">{Math.round(totals.cal)} / {targets?.calories ?? '—'} kcal</p>
                  <p className="text-2xs text-neutral-400 whitespace-nowrap">{latestDate ? (latestDate === serverToday ? 'today' : latestDate) : 'no entries yet'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap pl-[22px]">
                <span className={`flex-shrink-0 text-xs font-medium border rounded-full px-2 py-1 ${RANK_META.gold.className}`} title={`${weeklyGolds} gold ${weeklyGolds === 1 ? 'day' : 'days'} in the last 7 days`}>
                  🥇 {weeklyGolds}/7 this week
                </span>
                {rank && (
                  <span className={`flex-shrink-0 text-xs font-medium border rounded-full px-2 py-1 ${RANK_META[rank].className}`} title={rankOverridden ? `${RANK_META[rank].label} (set by coach)` : RANK_META[rank].label}>
                    {RANK_META[rank].emoji} {RANK_META[rank].label}
                  </span>
                )}
              </div>
            </PrefetchOnIntentLink>
          ))}
        </div>

        {archivedClients && archivedClients.length > 0 && (
          <details className="mt-6 group">
            <summary className="text-sm font-medium text-neutral-400 cursor-pointer list-none flex items-center gap-1.5 [&::-webkit-details-marker]:hidden">
              <span className="text-neutral-300 text-xs group-open:rotate-180 transition-transform">▾</span>
              Removed clients ({archivedClients.length})
            </summary>
            <div className="flex flex-col gap-2 mt-3">
              {archivedClients.map((c) => (
                <div key={c.id} className="flex items-center gap-3 bg-neutral-50 border border-border rounded-xl px-4 py-3">
                  <p className="flex-1 min-w-0 text-sm text-neutral-500 truncate">{c.full_name || c.email}</p>
                  <DeleteForeverButton userId={c.id} clientName={c.full_name || c.email} />
                  <RestoreClientButton userId={c.id} />
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </>
  );
}
