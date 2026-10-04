'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { localDateStr, addDays } from '@/lib/date';
import { computeDayRank, type Rank, type RankMealInput, type RankTargetsInput } from '@/lib/ranking';

const GOLD_SCORE = 85; // computeDayRank's gold threshold — the bar fills toward this
const WINDOW_DAYS = 60; // how far back to walk before giving up on an unbroken streak

// Same "hotter as it fills" idea as a real fire: each step swaps in a warmer
// gradient and glow as today's day gets closer to gold, then the bar turns
// gold itself the moment the day tips over.
const TIERS = [
  { min: 0, barClass: 'bg-neutral-300', glowClass: '' },
  { min: 15, barClass: 'bg-gradient-to-r from-amber-300 to-amber-400', glowClass: '' },
  { min: 40, barClass: 'bg-gradient-to-r from-amber-400 via-orange-400 to-orange-500', glowClass: 'shadow-[0_0_10px_rgba(251,146,60,0.55)]' },
  { min: 70, barClass: 'bg-gradient-to-r from-orange-500 via-red-500 to-red-600', glowClass: 'shadow-[0_0_14px_rgba(239,68,68,0.6)]' },
  { min: 100, barClass: 'bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400', glowClass: 'shadow-[0_0_18px_rgba(251,191,36,0.85)]' },
] as const;

function tierFor(pct: number) {
  let t: (typeof TIERS)[number] = TIERS[0];
  for (const tier of TIERS) if (pct >= tier.min) t = tier;
  return t;
}

// A couple of embers drifting off the bar once it's running hot.
const EMBERS = [
  { left: '22%', delay: '0s', duration: '1.6s' },
  { left: '58%', delay: '0.5s', duration: '1.9s' },
  { left: '80%', delay: '1s', duration: '1.5s' },
];

type Props = {
  meals: RankMealInput[];
  habitsTotal: number;
  habitsDone: number;
  targets: RankTargetsInput;
  /** A coach-confirmed rank for today, which beats the auto-computed one. */
  rankOverride: Rank | null;
};

// Fed live from the Today page: every logged meal or ticked habit changes the
// props, so the bar moves the instant it happens. Only the unbroken run of
// gold days *before* today is fetched (once) — today's own progress never
// waits on a round trip.
export default function GoldStreakMeter({ meals, habitsTotal, habitsDone, targets, rankOverride }: Props) {
  const [supabase] = useState(() => createClient());
  const [priorStreak, setPriorStreak] = useState<number | null>(null);

  const loadPrior = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPriorStreak(0); return; }

    const today = localDateStr();
    const yesterday = addDays(today, -1);
    const windowStart = addDays(today, -WINDOW_DAYS);

    const [mealsRes, completionsRes, overridesRes] = await Promise.all([
      supabase.from('food_log_entries').select('date, calories, protein_g, carbs_g, fat_g, quality_score').eq('user_id', user.id).gte('date', windowStart).lte('date', yesterday),
      supabase.from('habit_completions').select('date').eq('user_id', user.id).eq('completed', true).gte('date', windowStart).lte('date', yesterday),
      supabase.from('rank_overrides').select('date, rank').eq('user_id', user.id).gte('date', windowStart).lte('date', yesterday),
    ]);

    const mealsByDate = new Map<string, RankMealInput[]>();
    for (const m of mealsRes.data || []) {
      const arr = mealsByDate.get(m.date) || [];
      arr.push(m);
      mealsByDate.set(m.date, arr);
    }
    const habitsDoneByDate = new Map<string, number>();
    for (const row of completionsRes.data || []) habitsDoneByDate.set(row.date, (habitsDoneByDate.get(row.date) ?? 0) + 1);
    const overrideByDate = new Map((overridesRes.data || []).map((r) => [r.date, r.rank]));

    let s = 0;
    let cursor = yesterday;
    while (cursor >= windowStart) {
      const dayMeals = mealsByDate.get(cursor) || [];
      const hasData = dayMeals.length > 0 || habitsDoneByDate.has(cursor) || overrideByDate.has(cursor);
      if (!hasData) break;
      const rank = overrideByDate.get(cursor) ?? computeDayRank({ habitsTotal, habitsDone: habitsDoneByDate.get(cursor) ?? 0, meals: dayMeals, targets }).rank;
      if (rank !== 'gold') break;
      s++;
      cursor = addDays(cursor, -1);
    }
    setPriorStreak(s);
    // habitsTotal/targets only matter for judging past days; they're stable after load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => { loadPrior(); }, [loadPrior]);

  // ── today, computed straight from props ──
  const breakdown = computeDayRank({ habitsTotal, habitsDone, meals, targets });
  const todayGold = (rankOverride ?? breakdown.rank) === 'gold';
  const pct = todayGold ? 100 : Math.min(99, Math.round((breakdown.score / GOLD_SCORE) * 100));

  // Derived-state pattern: notice the % change during render (no effect, no
  // ref) so the "+N%" chip and bump replay on exactly the render that moved it.
  const [prevPct, setPrevPct] = useState(pct);
  const [gain, setGain] = useState<{ n: number; id: number } | null>(null);
  if (pct !== prevPct) {
    setPrevPct(pct);
    if (pct > prevPct) setGain({ n: pct - prevPct, id: (gain?.id ?? 0) + 1 });
  }
  useEffect(() => {
    if (!gain) return;
    const t = setTimeout(() => setGain(null), 1500);
    return () => clearTimeout(t);
  }, [gain]);

  if (priorStreak === null) {
    return <div className="rounded-card bg-neutral-100 h-[104px] animate-pulse" />;
  }

  const streak = priorStreak + (todayGold ? 1 : 0);
  const tier = tierFor(pct);
  const barPct = pct === 0 ? 0 : Math.max(6, pct);
  const hot = pct >= 70 && !todayGold;

  return (
    <div className={`bg-surface border rounded-2xl p-4 transition-colors ${todayGold ? 'border-rank-gold' : 'border-border'} ${gain && todayGold ? 'animate-[gold-pop_0.5s_ease-out]' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium">
          Gold streak{streak > 0 && <span className="text-neutral-400 font-normal"> ({streak} day{streak === 1 ? '' : 's'})</span>}
        </p>
        <span className="text-sm font-semibold flex items-center gap-1">
          <span className={streak > 0 ? 'animate-[flame-flicker_1.4s_ease-in-out_infinite]' : 'opacity-30'}>🔥</span>
          {streak}
        </span>
      </div>

      <div className="relative">
        <div className="relative h-3 rounded-full bg-neutral-100 overflow-hidden">
          <div
            key={gain?.id ?? 0}
            className={`relative h-full rounded-full transition-[width] duration-700 ease-out bg-[length:200%_100%] origin-left ${tier.barClass} ${tier.glowClass} ${pct > 0 ? 'animate-[flame-shimmer_2.5s_ease-in-out_infinite]' : ''} ${gain ? 'animate-[meter-bump_0.6s_ease-out]' : ''}`}
            style={{ width: `${barPct}%` }}
          />
          {todayGold && (
            <span className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/70 to-transparent pointer-events-none animate-[gold-sweep_2.8s_ease-in-out_infinite]" />
          )}
          {hot && EMBERS.map((e, i) => (
            <span
              key={i}
              className="absolute bottom-0.5 text-[8px] pointer-events-none animate-[ember-rise_1.8s_ease-in-out_infinite]"
              style={{ left: e.left, animationDelay: e.delay, animationDuration: e.duration }}
            >
              🔥
            </span>
          ))}
        </div>
        {gain && (
          <span
            key={gain.id}
            className="absolute -top-5 text-2xs font-semibold text-orange-500 pointer-events-none animate-[chip-rise_1.4s_ease-out_forwards]"
            style={{ left: `clamp(0%, calc(${barPct}% - 14px), 88%)` }}
          >
            +{gain.n}%
          </span>
        )}
      </div>

      <p className="text-2xs text-neutral-500 mt-2">
        {todayGold ? (
          <>🥇 <span className="font-medium text-rank-gold-text">Gold locked in for today</span> — your streak is {streak} day{streak === 1 ? '' : 's'}.</>
        ) : (
          <>
            <span className="font-medium text-neutral-700">{pct}% of the way to today&rsquo;s gold</span>
            {' · '}{nextStep(breakdown, habitsTotal, habitsDone, meals.length, priorStreak)}
          </>
        )}
      </p>
    </div>
  );
}

// One concrete nudge: whichever ingredient of the day's score is holding it back.
function nextStep(b: ReturnType<typeof computeDayRank>, habitsTotal: number, habitsDone: number, mealCount: number, priorStreak: number): string {
  const parts: { key: 'habits' | 'macros' | 'quality'; pct: number }[] = [];
  if (b.habitsPct != null) parts.push({ key: 'habits', pct: b.habitsPct });
  if (b.macroPct != null) parts.push({ key: 'macros', pct: b.macroPct });
  if (b.qualityPct != null) parts.push({ key: 'quality', pct: b.qualityPct });
  const weakest = parts.sort((a, c) => a.pct - c.pct)[0];
  const keep = priorStreak > 0 ? ` to keep your ${priorStreak}-day streak going` : '';

  if (mealCount === 0 && (!weakest || weakest.key !== 'habits')) return `log your first meal${keep}.`;
  if (!weakest) return `log a meal or tick a habit${keep}.`;
  if (weakest.key === 'habits') {
    const left = habitsTotal - habitsDone;
    return `${left} habit${left === 1 ? '' : 's'} left to tick${keep}.`;
  }
  if (weakest.key === 'macros') return `get your macros closer to target${keep}.`;
  return `pick higher-quality foods${keep}.`;
}
