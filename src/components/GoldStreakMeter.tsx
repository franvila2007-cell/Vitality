'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { localDateStr, addDays } from '@/lib/date';
import { computeDayRank, tierOf, TIER_META, TIER_MIN, TIER_ORDER, type Rank, type RankMealInput, type RankTargetsInput, type Tier } from '@/lib/ranking';
import { completionsByDate, habitDay, type HabitSchedule } from '@/lib/habits';
import { BADGES, VITAL_WEEK_DAYS, type BadgeKey } from '@/lib/vitalityBadges';

const WINDOW_DAYS = 70; // enough history for the 60-day badge

type Props = {
  meals: RankMealInput[];
  /** Today's due habits / ticked — drives the live tier. */
  habitsTotal: number;
  habitsDone: number;
  /** Every habit with its schedule, for judging past days. */
  habits: HabitSchedule[];
  targets: RankTargetsInput;
  /** A coach-confirmed rank for today, which beats the auto-computed one. */
  rankOverride: Rank | null;
};

type History = {
  /** Vital days in a row before today. */
  priorStreak: number;
  /** Vital days this week (Mon–yesterday). */
  weekVitalBefore: number;
  /** Last week's tier counts — shown as a recap on Mondays. */
  lastWeek: Record<Tier, number> | null;
  earned: Set<BadgeKey>;
};

// The Today hero: today's Vitality tier live (Flat → Spark → Charged → Vital)
// with Vitto in that tier's pose, the bar to the next tier, the Vital streak,
// this week's progress towards a Vital week, and streak badges that unlock with
// a celebration. Fed live from the Today page props; only past days are fetched.
export default function GoldStreakMeter({ meals, habitsTotal, habitsDone, habits, targets, rankOverride }: Props) {
  const [supabase] = useState(() => createClient());
  const [history, setHistory] = useState<History | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<BadgeKey | null>(null);

  const loadHistory = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setHistory({ priorStreak: 0, weekVitalBefore: 0, lastWeek: null, earned: new Set() }); return; }
    setUserId(user.id);

    const today = localDateStr();
    const yesterday = addDays(today, -1);
    const windowStart = addDays(today, -WINDOW_DAYS);

    const [mealsRes, completionsRes, overridesRes, badgesRes] = await Promise.all([
      supabase.from('food_log_entries').select('date, calories, protein_g, carbs_g, fat_g, quality_score').eq('user_id', user.id).gte('date', windowStart).lte('date', yesterday),
      supabase.from('habit_completions').select('habit_id, date').eq('user_id', user.id).eq('completed', true).gte('date', windowStart).lte('date', yesterday),
      supabase.from('rank_overrides').select('date, rank').eq('user_id', user.id).gte('date', windowStart).lte('date', yesterday),
      supabase.from('vitality_badges').select('badge').eq('user_id', user.id),
    ]);

    const mealsByDate = new Map<string, RankMealInput[]>();
    for (const m of mealsRes.data || []) {
      const arr = mealsByDate.get(m.date) || [];
      arr.push(m);
      mealsByDate.set(m.date, arr);
    }
    const doneByDate = completionsByDate(completionsRes.data || []);
    const overrideByDate = new Map((overridesRes.data || []).map((r) => [r.date, r.rank]));

    // A day with nothing logged has no tier (it breaks a streak, counts as nothing).
    const tierOn = (d: string): Tier | null => {
      const dayMeals = mealsByDate.get(d) || [];
      if (!(dayMeals.length > 0 || doneByDate.has(d) || overrideByDate.has(d))) return null;
      const override = overrideByDate.get(d);
      if (override) return tierOf(override, null, true);
      const day = habitDay(habits, doneByDate, d);
      return computeDayRank({ habitsTotal: day.total, habitsDone: day.done, meals: dayMeals, targets }).tier;
    };

    let priorStreak = 0;
    for (let d = yesterday; d >= windowStart && tierOn(d) === 'vital'; d = addDays(d, -1)) priorStreak++;

    // Weeks start on Monday.
    const [y, m, dd] = today.split('-').map(Number);
    const dow = (new Date(y, m - 1, dd).getDay() + 6) % 7; // 0 = Monday
    const monday = addDays(today, -dow);
    let weekVitalBefore = 0;
    for (let d = monday; d < today; d = addDays(d, 1)) if (tierOn(d) === 'vital') weekVitalBefore++;

    let lastWeek: Record<Tier, number> | null = null;
    if (dow === 0) {
      lastWeek = { flat: 0, spark: 0, charged: 0, vital: 0 };
      let any = false;
      for (let i = 7; i >= 1; i--) { const t = tierOn(addDays(today, -i)); if (t) { lastWeek[t]++; any = true; } }
      if (!any) lastWeek = null;
    }

    setHistory({ priorStreak, weekVitalBefore, lastWeek, earned: new Set((badgesRes.data || []).map((b) => b.badge as BadgeKey)) });
    // habits/targets only matter for judging past days; they're stable after load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── today, straight from props ──
  const breakdown = computeDayRank({ habitsTotal, habitsDone, meals, targets });
  const tier: Tier = rankOverride ? tierOf(rankOverride, null, true) : breakdown.tier;
  const todayVital = tier === 'vital';
  const streak = (history?.priorStreak ?? 0) + (todayVital ? 1 : 0);

  // Unlock any streak badge the current streak has reached for the first time
  // (derived-state pattern: noticed during render, saved by the effect below).
  const [toSave, setToSave] = useState<BadgeKey[]>([]);
  if (history && userId) {
    const newly = BADGES.filter((b) => streak >= b.days && !history.earned.has(b.key));
    if (newly.length > 0) {
      const earned = new Set(history.earned);
      for (const b of newly) earned.add(b.key);
      setHistory({ ...history, earned });
      setCelebrate(newly[newly.length - 1].key);
      setToSave([...toSave, ...newly.map((b) => b.key)]);
    }
  }
  useEffect(() => {
    if (!userId || toSave.length === 0) return;
    supabase.from('vitality_badges')
      .upsert(toSave.map((badge) => ({ user_id: userId, badge })), { onConflict: 'user_id,badge', ignoreDuplicates: true })
      .then(() => setToSave([]));
  }, [toSave, userId, supabase]);

  if (!history) return <div className="rounded-2xl bg-neutral-100 h-[188px] animate-pulse" />;

  const meta = TIER_META[tier];
  const next = TIER_ORDER[TIER_ORDER.indexOf(tier) + 1] as Tier | undefined;
  const score = Math.round(breakdown.score);
  const barPct = next
    ? Math.max(4, Math.min(99, Math.round(((breakdown.score - TIER_MIN[tier]) / (TIER_MIN[next] - TIER_MIN[tier])) * 100)))
    : 100;
  const weekVital = history.weekVitalBefore + (todayVital ? 1 : 0);
  const nextBadge = BADGES.find((b) => !history.earned.has(b.key));

  return (
    <>
      <div className={`relative overflow-hidden rounded-2xl p-4 border-2 ${todayVital ? 'bg-tier-vital-bg border-tier-vital-trim text-white' : 'bg-surface border-border'}`}>
        <div className="flex items-center gap-4">
          <div className={`relative h-24 w-24 shrink-0 rounded-full border-4 ${meta.ring} overflow-hidden`}>
            <Image src={meta.vitto} alt={`Vitto — ${meta.label}`} fill sizes="96px" className="object-contain p-1 animate-[vitto-bob_2.6s_ease-in-out_infinite]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-3xs uppercase tracking-wide ${todayVital ? 'text-white/60' : 'text-neutral-400'}`}>
              Today so far{rankOverride ? ' · confirmed by your coach' : ''}
            </p>
            <p className={`text-2xl font-semibold leading-tight ${todayVital ? 'text-white' : meta.text}`}>{meta.label}</p>
            <p className={`text-xs ${todayVital ? 'text-white/80' : 'text-neutral-500'}`}>{meta.tagline}</p>
            <p className={`mt-1 text-xs font-medium flex items-center gap-1 ${todayVital ? 'text-tier-vital-trim' : 'text-neutral-700'}`}>
              <span className={streak > 0 ? 'animate-[flame-flicker_1.4s_ease-in-out_infinite]' : 'opacity-30'}>🔥</span>
              {streak} Vital day{streak === 1 ? '' : 's'} in a row
            </p>
          </div>
        </div>

        {next && (
          <div className="mt-3">
            <div className="flex justify-between text-2xs mb-1">
              <span className={todayVital ? 'text-white/70' : 'text-neutral-500'}>Score {score}</span>
              <span className={`font-medium ${TIER_META[next].text}`}>{TIER_MIN[next]} → {TIER_META[next].label}</span>
            </div>
            <div className="h-2.5 rounded-full bg-neutral-100 overflow-hidden">
              <div className={`h-full rounded-full transition-[width] duration-700 ease-out ${TIER_META[next].pip}`} style={{ width: `${barPct}%` }} />
            </div>
          </div>
        )}

        <p className={`mt-2 text-2xs ${todayVital ? 'text-white/85' : 'text-neutral-600'}`}>
          {todayVital
            ? <>Vital locked in for today.{nextBadge ? ` ${Math.max(0, nextBadge.days - streak)} more to unlock “${nextBadge.name}”.` : ' Every badge earned — legend.'}</>
            : <>Next: {nextStep(breakdown, habitsTotal, habitsDone, meals.length, next ? TIER_META[next].label : 'Vital')}</>}
        </p>

        {/* Vital week: 5 of 7 days Vital, Monday to Sunday */}
        <div className={`mt-3 pt-3 border-t ${todayVital ? 'border-white/15' : 'border-border'} flex items-center gap-3`}>
          <div className="relative h-10 w-10 shrink-0">
            <Image src="/vitto/vital-week.webp" alt="" fill sizes="40px" className={`object-contain ${weekVital >= VITAL_WEEK_DAYS ? '' : 'grayscale opacity-50'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-xs font-medium ${todayVital ? 'text-white' : 'text-neutral-800'}`}>
              {weekVital >= VITAL_WEEK_DAYS ? 'Vital week earned 👑' : `Vital week: ${weekVital} of ${VITAL_WEEK_DAYS} Vital days`}
            </p>
            <div className="mt-1 flex gap-1">
              {Array.from({ length: VITAL_WEEK_DAYS }, (_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < weekVital ? 'bg-tier-vital-trim' : todayVital ? 'bg-white/20' : 'bg-neutral-200'}`} />
              ))}
            </div>
          </div>
        </div>

        {history.lastWeek && (
          <p className={`mt-2 text-2xs ${todayVital ? 'text-white/70' : 'text-neutral-500'}`}>
            Last week: {history.lastWeek.vital} Vital · {history.lastWeek.charged} Charged · {history.lastWeek.spark} Spark{history.lastWeek.flat ? ` · ${history.lastWeek.flat} Flat` : ''}
          </p>
        )}
      </div>

      {celebrate && <BadgeCelebration badge={celebrate} onClose={() => setCelebrate(null)} />}
    </>
  );
}

function BadgeCelebration({ badge, onClose }: { badge: BadgeKey; onClose: () => void }) {
  const b = BADGES.find((x) => x.key === badge)!;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Badge unlocked: ${b.name}`}>
      <div className="w-full max-w-xs rounded-3xl bg-surface p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-3xs uppercase tracking-wide text-neutral-400">Badge unlocked</p>
        <div className={`relative mx-auto my-4 h-40 w-40 rounded-full border-4 ${b.frame} animate-[badge-unlock_0.7s_ease-out]`}>
          <Image src={b.vitto} alt={`Vitto — ${b.name}`} fill sizes="160px" className="object-contain p-3" />
          <span className={`absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-sm font-bold ${b.number}`}>{b.days}</span>
        </div>
        <p className="text-xl font-semibold text-brand-dark">{b.name}</p>
        <p className="text-sm text-neutral-500 mt-1">{b.days} Vital days in a row. Vitto&rsquo;s proud of you.</p>
        <button onClick={onClose} className="mt-5 w-full rounded-full bg-brand py-2.5 text-sm font-medium text-white">Keep going</button>
      </div>
    </div>
  );
}

// One concrete nudge: whichever part of the day's score is holding it back.
function nextStep(b: ReturnType<typeof computeDayRank>, habitsTotal: number, habitsDone: number, mealCount: number, nextLabel: string): string {
  const parts: { key: 'habits' | 'macros' | 'quality'; pct: number }[] = [];
  if (b.habitsPct != null) parts.push({ key: 'habits', pct: b.habitsPct });
  if (b.macroPct != null) parts.push({ key: 'macros', pct: b.macroPct });
  if (b.qualityPct != null) parts.push({ key: 'quality', pct: b.qualityPct });
  const weakest = parts.sort((a, c) => a.pct - c.pct)[0];
  const to = ` to reach ${nextLabel}.`;

  if (mealCount === 0 && (!weakest || weakest.key !== 'habits')) return `log your first meal${to}`;
  if (!weakest) return `log a meal or tick a habit${to}`;
  if (weakest.key === 'habits') {
    const left = habitsTotal - habitsDone;
    return `tick ${left} more habit${left === 1 ? '' : 's'}${to}`;
  }
  if (weakest.key === 'macros') return `get your macros closer to target${to}`;
  return `pick higher-quality foods${to}`;
}
