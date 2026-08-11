import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProjections, computeMonthColors, type GoalType } from '@/lib/progress';
import { computeDayRank, RANK_META } from '@/lib/ranking';

export default async function CoachPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'coach') redirect('/');

  const { data: clients } = await supabase.from('profiles').select('id, full_name, email').eq('role', 'client').order('full_name');

  const rows = await Promise.all(
    (clients || []).map(async (c) => {
      const [profRes, targetsRes, recentMealsRes, cpRes, habitsRes] = await Promise.all([
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

      let rank = null as ReturnType<typeof computeDayRank>['rank'] | null;
      let rankOverridden = false;
      if (latestDate) {
        const [completionsRes, overrideRes] = await Promise.all([
          supabase.from('habit_completions').select('habit_id').eq('user_id', c.id).eq('date', latestDate).eq('completed', true),
          supabase.from('rank_overrides').select('rank').eq('user_id', c.id).eq('date', latestDate).maybeSingle(),
        ]);
        const breakdown = computeDayRank({
          habitsTotal: habitsRes.data?.length ?? 0,
          habitsDone: completionsRes.data?.length ?? 0,
          meals: latestMeals.map((m) => ({ calories: m.calories, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g, quality_score: m.quality_score })),
          targets: targetsRes.data ? { calories: targetsRes.data.calories, protein_g: targetsRes.data.protein_g, carbs_g: targetsRes.data.carbs_g, fat_g: targetsRes.data.fat_g } : null,
        });
        rank = overrideRes.data?.rank ?? breakdown.rank;
        rankOverridden = !!overrideRes.data;
      }

      return { client: c, profile: profRes.data, targets: targetsRes.data, totals, status, latestDate, rank, rankOverridden };
    })
  );

  const serverToday = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-10 bg-surface border-b border-border">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/coach" className="flex items-center gap-2 transition-opacity hover:opacity-70">
            <Image src="/vitality-logo.png" alt="Vitality" width={32} height={25} priority />
            <span className="text-xs font-medium text-neutral-400 border border-border rounded-full px-2 py-0.5">Coach</span>
          </Link>
          <SignOutButton />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-medium">Clients ({rows.length})</h1>
          <Link href="/coach/clients/new" className="rounded-lg bg-brand text-white px-4 py-2 text-sm font-medium hover:opacity-90">+ Add client</Link>
        </div>

        {rows.length === 0 && <p className="text-sm text-neutral-400">No clients yet — add your first one.</p>}

        <div className="flex flex-col gap-2">
          {rows.map(({ client, profile, targets, totals, status, latestDate, rank, rankOverridden }) => (
            <Link key={client.id} href={`/coach/clients/${client.id}`} className="flex items-center gap-4 bg-surface border border-border rounded-xl px-4 py-3 hover:border-brand transition-colors">
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  status === 'green' ? 'bg-emerald-500' : status === 'orange' ? 'bg-amber-500' : status === 'red' ? 'bg-red-500' : 'bg-neutral-300'
                }`}
                title={status || 'no data yet'}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{client.full_name || client.email}</p>
                <p className="text-xs text-neutral-400 truncate">
                  {profile ? `${profile.goal_type === 'lose' ? 'Losing' : 'Gaining'} to ${profile.goal_weight}kg` : 'No program set up'}
                </p>
              </div>
              {rank && (
                <span className={`flex-shrink-0 text-xs font-medium border rounded-full px-2 py-1 ${RANK_META[rank].className}`} title={rankOverridden ? `${RANK_META[rank].label} (set by coach)` : RANK_META[rank].label}>
                  {RANK_META[rank].emoji} {RANK_META[rank].label}
                </span>
              )}
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-medium">{Math.round(totals.cal)} / {targets?.calories ?? '—'} kcal</p>
                <p className="text-[11px] text-neutral-400">{latestDate ? (latestDate === serverToday ? 'today' : latestDate) : 'no entries yet'}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function SignOutButton() {
  return (
    <form action="/api/auth/signout" method="post">
      <button className="text-xs text-neutral-400 hover:text-neutral-600">Sign out</button>
    </form>
  );
}
