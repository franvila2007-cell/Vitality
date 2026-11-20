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

// `className` is the light badge-pill treatment (bg/text/border); `pipClassName`
// is a solid fill for the compact week-history squares — both now come from
// the same --rank-gold/silver/bronze tokens (globals.css) instead of three
// independent, mismatched palettes across ranking.ts and two week-pip sites.
//
// Clients see these as Vitality tiers: gold = Vital, silver = Charged,
// bronze = Spark (the stored keys stay gold/silver/bronze so coach overrides
// and history keep working). A bronze day scoring under FLAT_BELOW shows as a
// fourth tier, Flat, so a poor day reads as one.
export const RANK_META: Record<Rank, { label: string; emoji: string; className: string; pipClassName: string }> = {
  gold: { label: 'Vital', emoji: '💠', className: 'bg-tier-vital-bg text-tier-vital-text border-tier-vital-trim', pipClassName: 'bg-tier-vital ring-1 ring-tier-vital-trim' },
  silver: { label: 'Charged', emoji: '🔋', className: 'bg-tier-charged-bg text-tier-charged-text border-tier-charged', pipClassName: 'bg-tier-charged' },
  bronze: { label: 'Spark', emoji: '⚡', className: 'bg-tier-spark-bg text-tier-spark-text border-tier-spark', pipClassName: 'bg-tier-spark' },
};

export type Tier = 'flat' | 'spark' | 'charged' | 'vital';
export const FLAT_BELOW = 40;
export const TIER_ORDER: Tier[] = ['flat', 'spark', 'charged', 'vital'];
/** Score each tier starts at (Vital = the gold threshold). */
export const TIER_MIN: Record<Tier, number> = { flat: 0, spark: FLAT_BELOW, charged: 65, vital: 85 };

export const TIER_META: Record<Tier, {
  label: string; vitto: string; tagline: string;
  /** Medallion ring + light fill around Vitto. */
  ring: string; pip: string; text: string; pill: string;
}> = {
  flat: { label: 'Flat', vitto: '/vitto/flat.webp', tagline: 'Running on empty — recharge today', ring: 'border-tier-flat bg-tier-flat-bg', pip: 'bg-tier-flat', text: 'text-tier-flat-text', pill: 'bg-tier-flat-bg text-tier-flat-text border-tier-flat' },
  spark: { label: 'Spark', vitto: '/vitto/spark.webp', tagline: 'You showed up — keep it going', ring: 'border-tier-spark bg-tier-spark-bg', pip: 'bg-tier-spark', text: 'text-tier-spark-text', pill: RANK_META.bronze.className },
  charged: { label: 'Charged', vitto: '/vitto/charged.webp', tagline: 'Solid day — Vital is close', ring: 'border-tier-charged bg-tier-charged-bg', pip: 'bg-tier-charged', text: 'text-tier-charged-text', pill: RANK_META.silver.className },
  vital: { label: 'Vital', vitto: '/vitto/vital.webp', tagline: 'You nailed it today', ring: 'border-tier-vital-trim bg-tier-charged-bg', pip: 'bg-tier-vital ring-1 ring-tier-vital-trim', text: 'text-tier-vital', pill: RANK_META.gold.className },
};

/** The tier a day shows as. A coach override wins (bronze → Spark, never Flat). */
export function tierOf(rank: Rank, score: number | null, overridden = false): Tier {
  if (rank === 'gold') return 'vital';
  if (rank === 'silver') return 'charged';
  return !overridden && score !== null && score < FLAT_BELOW ? 'flat' : 'spark';
}

export type RankMealInput = { calories: number; protein_g: number; carbs_g: number; fat_g: number; quality_score: number | null };
export type RankTargetsInput = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

export type RankBreakdown = {
  habitsPct: number | null;
  macroPct: number | null;
  qualityPct: number | null;
  score: number;
  rank: Rank;
  tier: Tier;
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

  return { habitsPct, macroPct, qualityPct, score, rank, tier: tierOf(rank, score) };
}
