// Streak badges — unlocked by Vital days in a row. Stored once earned
// (vitality_badges) so they stay on the shelf after a streak breaks.
export type BadgeKey = 'streak_3' | 'streak_7' | 'streak_14' | 'streak_30' | 'streak_60';

export const BADGES: { key: BadgeKey; days: number; name: string; vitto: string; frame: string; number: string }[] = [
  { key: 'streak_3', days: 3, name: 'First Spark', vitto: '/vitto/spark.webp', frame: 'border-tier-spark bg-tier-spark-bg', number: 'bg-tier-spark text-white' },
  { key: 'streak_7', days: 7, name: 'Fully Charged', vitto: '/vitto/charged.webp', frame: 'border-tier-charged bg-tier-charged-bg', number: 'bg-tier-charged text-tier-charged-text' },
  { key: 'streak_14', days: 14, name: 'Vital Fortnight', vitto: '/vitto/vital.webp', frame: 'border-tier-vital bg-tier-charged-bg', number: 'bg-tier-vital text-white' },
  { key: 'streak_30', days: 30, name: 'Vital Month', vitto: '/vitto/trophy.webp', frame: 'border-tier-vital-trim bg-tier-charged-bg', number: 'bg-tier-vital-bg text-tier-vital-trim' },
  { key: 'streak_60', days: 60, name: 'Vitality Legend', vitto: '/vitto/legend.webp', frame: 'border-tier-vital-trim bg-tier-vital-bg', number: 'bg-tier-vital-trim text-tier-vital-bg' },
];

export const BADGE_BY_KEY = Object.fromEntries(BADGES.map((b) => [b.key, b])) as Record<BadgeKey, (typeof BADGES)[number]>;

/** Vital days needed in a week for a "Vital week". */
export const VITAL_WEEK_DAYS = 5;
