// Training tab — every kind of session in one log (training_sessions).
// Each kind only asks for what makes sense for it: distance for runs, walks,
// rides and swims; just time and effort for the rest.

export type TrainingKind = 'strength' | 'run' | 'walk' | 'cycle' | 'swim' | 'hiit' | 'class' | 'sport' | 'yoga' | 'other';

export type TrainingSession = {
  id: string;
  user_id: string;
  date: string;
  kind: TrainingKind;
  title: string | null;
  duration_min: number | null;
  distance_km: number | null;
  effort: number | null;
  notes: string | null;
  created_at: string;
};

export const KINDS: Record<TrainingKind, {
  label: string; emoji: string; distance: boolean;
  /** Placeholder for the optional name field. */
  example: string;
  /** Quick name chips. */
  names: string[];
  chip: string;
}> = {
  strength: { label: 'Gym', emoji: '🏋️', distance: false, example: 'Push day', names: ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full body'], chip: 'bg-brand-light text-brand-dark' },
  run: { label: 'Run', emoji: '🏃', distance: true, example: 'Parkrun', names: ['Easy run', 'Long run', 'Intervals', 'Tempo', 'Treadmill'], chip: 'bg-[#e6f4fb] text-[#1f7aa8]' },
  walk: { label: 'Walk', emoji: '🚶', distance: true, example: 'Evening walk', names: ['Walk', 'Hike', 'Incline walk'], chip: 'bg-[#eaf3de] text-[#3b6d11]' },
  cycle: { label: 'Cycle', emoji: '🚴', distance: true, example: 'Spin class', names: ['Road ride', 'Spin', 'Bike'], chip: 'bg-[#e6f4fb] text-[#1f7aa8]' },
  swim: { label: 'Swim', emoji: '🏊', distance: true, example: 'Pool laps', names: ['Pool', 'Sea swim'], chip: 'bg-[#e6f4fb] text-[#1f7aa8]' },
  hiit: { label: 'HIIT', emoji: '🔥', distance: false, example: 'Circuit', names: ['HIIT', 'Circuit', 'CrossFit', 'Bootcamp'], chip: 'bg-[#fdece4] text-[#b4451f]' },
  class: { label: 'Class', emoji: '🤸', distance: false, example: 'Pilates', names: ['Pilates', 'Spin', 'Boxing', 'Dance', 'Body pump'], chip: 'bg-[#f1ecfd] text-[#6b46c1]' },
  sport: { label: 'Sport', emoji: '⚽', distance: false, example: 'Football', names: ['Football', 'Padel', 'Tennis', 'Basketball', 'Martial arts'], chip: 'bg-[#fdf3d8] text-[#8a5a00]' },
  yoga: { label: 'Yoga', emoji: '🧘', distance: false, example: 'Mobility', names: ['Yoga', 'Mobility', 'Stretching'], chip: 'bg-[#eaf3de] text-[#3b6d11]' },
  other: { label: 'Other', emoji: '✨', distance: false, example: 'Anything you did', names: [], chip: 'bg-neutral-100 text-neutral-600' },
};

export const KIND_ORDER: TrainingKind[] = ['strength', 'run', 'walk', 'cycle', 'swim', 'hiit', 'class', 'sport', 'yoga', 'other'];
export const DURATION_CHIPS = [15, 30, 45, 60, 90];
export const EFFORTS: { value: number; label: string; emoji: string }[] = [
  { value: 3, label: 'Easy', emoji: '😌' },
  { value: 5, label: 'Moderate', emoji: '🙂' },
  { value: 7, label: 'Hard', emoji: '😤' },
  { value: 9, label: 'All out', emoji: '🥵' },
];

export const sessionName = (s: Pick<TrainingSession, 'kind' | 'title'>) => s.title?.trim() || KINDS[s.kind].label;

/** Minutes per km, as "5:12 /km". */
export function paceLabel(durationMin: number | null, km: number | null): string | null {
  if (!durationMin || !km || km <= 0) return null;
  const perKm = durationMin / km;
  if (perKm > 60) return null;
  const m = Math.floor(perKm);
  const s = Math.round((perKm - m) * 60);
  return `${s === 60 ? m + 1 : m}:${String(s === 60 ? 0 : s).padStart(2, '0')} /km`;
}

export function durationLabel(min: number | null): string | null {
  if (!min) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtKm(km: number): string {
  return km >= 10 ? km.toFixed(1).replace(/\.0$/, '') : km.toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
}

/** The sessions a client repeats most (same kind + name + time + distance) — one tap to log again. */
export function goTos(sessions: TrainingSession[], max = 4): TrainingSession[] {
  const counts = new Map<string, { s: TrainingSession; n: number }>();
  for (const s of sessions) {
    const key = [s.kind, (s.title || '').trim().toLowerCase(), s.duration_min ?? '', s.distance_km ?? ''].join('|');
    const cur = counts.get(key);
    if (cur) cur.n++; else counts.set(key, { s, n: 1 });
  }
  return [...counts.values()].filter((c) => c.n >= 2).sort((a, b) => b.n - a.n).slice(0, max).map((c) => c.s);
}
