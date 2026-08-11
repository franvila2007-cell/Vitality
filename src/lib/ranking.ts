// Daily rank — gold/silver/bronze — computed from three equally-weighted
// components: habit completion %, how close logged macros landed to target,
// and food quality (Vitto rates each logged item 0-100 at log time; see
// llmRateFoodQuality in vitto/llmFallback.ts). Any component with no data
// yet (e.g. no habits configured) is left out of the average rather than
// counted as zero, except macros: zero meals logged is scored as 0, since
// not logging is itself informative for a tracking app.
//
// This is computed on the fly from raw data rather than stored, so it can
// never go stale when a client edits a meal or habit after the fact — only
// a coach's manual override (rank_overrides table) is persisted.
export type Rank = 'gold' | 'silver' | 'bronze';

export const RANK_META: Record<Rank, { label: string; emoji: string; className: string }> = {
  gold: { label: 'Gold', emoji: '🥇', className: 'bg-amber-100 text-amber-700 border-amber-300' },
  silver: { label: 'Silver', emoji: '🥈', className: 'bg-neutral-200 text-neutral-600 border-neutral-300' },
  bronze: { label: 'Bronze', emoji: '🥉', className: 'bg-orange-100 text-orange-700 border-orange-300' },
};

export type RankMealInput = { calories: number; protein_g: number; carbs_g: number; fat_g: number; quality_score: number | null };
export type RankTargetsInput = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

export type RankBreakdown = {
  habitsPct: number | null;
  macroPct: number | null;
  qualityPct: number | null;
  score: number;
  rank: Rank;
};

function closeness(actual: number, target: number): number {
  if (target <= 0) return 100;
  const diffPct = (Math.abs(actual - target) / target) * 100;
  return Math.max(0, 100 - diffPct);
}

export function computeDayRank(inputs: {
  habitsTotal: number;
  habitsDone: number;
  meals: RankMealInput[];
  targets: RankTargetsInput | null;
}): RankBreakdown {
  const habitsPct = inputs.habitsTotal > 0 ? (inputs.habitsDone / inputs.habitsTotal) * 100 : null;

  let macroPct: number | null = null;
  if (inputs.meals.length === 0) {
    macroPct = 0;
  } else if (inputs.targets) {
    const totals = inputs.meals.reduce(
      (a, m) => ({ cal: a.cal + m.calories, prot: a.prot + m.protein_g, carb: a.carb + m.carbs_g, fat: a.fat + m.fat_g }),
      { cal: 0, prot: 0, carb: 0, fat: 0 }
    );
    macroPct =
      (closeness(totals.cal, inputs.targets.calories) +
        closeness(totals.prot, inputs.targets.protein_g) +
        closeness(totals.carb, inputs.targets.carbs_g) +
        closeness(totals.fat, inputs.targets.fat_g)) /
      4;
  }

  const rated = inputs.meals.filter((m) => m.quality_score != null);
  const qualityPct = rated.length > 0 ? rated.reduce((a, m) => a + (m.quality_score as number), 0) / rated.length : null;

  const components = [habitsPct, macroPct, qualityPct].filter((v): v is number => v != null);
  const score = components.length > 0 ? components.reduce((a, v) => a + v, 0) / components.length : 0;
  const rank: Rank = score >= 85 ? 'gold' : score >= 65 ? 'silver' : 'bronze';

  return { habitsPct, macroPct, qualityPct, score, rank };
}
