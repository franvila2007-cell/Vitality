import { createClient } from '@/lib/supabase/server';
import { getProjections, type GoalType } from '@/lib/progress';

// Fractions of the program at which a milestone lands — same shape as the
// original fixed 0/14/21/30/45/60-out-of-60 schedule, but expressed as
// fractions so it scales to each client's actual program_length_days
// instead of assuming everyone is on a 60-day program.
const MILESTONE_FRACTIONS = [0, 0.233, 0.35, 0.5, 0.75, 1] as const;

function weightAtDay(day: number, startWeight: number, projections: number[], periodDays: number): number {
  if (day <= 0) return startWeight;
  const periodIdx = Math.min(projections.length - 1, Math.floor((day - 1) / periodDays));
  const periodStartDay = periodIdx * periodDays;
  const periodStartWeight = periodIdx === 0 ? startWeight : projections[periodIdx - 1];
  const periodEndWeight = projections[periodIdx];
  const t = Math.min(1, Math.max(0, (day - periodStartDay) / periodDays));
  return periodStartWeight + (periodEndWeight - periodStartWeight) * t;
}

// Auth/role guard and <AppNav/> now live in (client)/layout.tsx — this
// page still needs its own auth call for user.id, just not the redirects.
export default async function MilestonesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null; // layout already redirects; this only satisfies TS

  const { data: cp } = await supabase.from('client_profiles').select('*').eq('user_id', user.id).maybeSingle();

  if (!cp) {
    return <div className="max-w-2xl mx-auto px-4 py-10 text-sm text-neutral-400 page-fade-in">Your coach hasn&rsquo;t set up your program yet.</div>;
  }

  const programDays = cp.program_length_days || 60;
  const dayNum = Math.max(1, Math.min(programDays, Math.floor((Date.now() - new Date(cp.start_date).getTime()) / 86400000) + 1));
  const goalType = cp.goal_type as GoalType;
  const pace = (cp.pace_config as Record<string, number[]>)?.[goalType] || [1.5, 1.5, 1.5, 1.5, 1.5, 1.5];
  const projections = getProjections(cp.start_weight, goalType, pace);
  const periodDays = programDays / pace.length;
  const totalChange = Math.abs(cp.goal_weight - cp.start_weight);
  const verb = goalType === 'lose' ? 'Losing' : 'Gaining';

  const milestones = MILESTONE_FRACTIONS.map((frac, i) => {
    const day = Math.max(0, Math.round(programDays * frac));
    const rawWeight = frac >= 1 ? cp.goal_weight : weightAtDay(day, cp.start_weight, projections, periodDays);
    // pace_config is a generic default pace, not tuned to this client's
    // actual goal delta — it can project past the goal before the program
    // even ends, so clamp toward the goal rather than showing >100%.
    const clampedWeight = goalType === 'lose' ? Math.max(rawWeight, cp.goal_weight) : Math.min(rawWeight, cp.goal_weight);
    const targetWeight = Math.round(clampedWeight * 10) / 10;
    const changeSoFar = Math.min(totalChange, Math.abs(targetWeight - cp.start_weight));
    const pctToGoal = totalChange > 0 ? Math.min(100, Math.round((changeSoFar / totalChange) * 100)) : 100;

    let label: string;
    if (i === 0) label = `Program starts — ${cp.start_weight}kg`;
    else if (frac >= 1) label = `Reach your goal — ${cp.goal_weight}kg`;
    else if (i === 1) label = `Habits should be sticking — aiming for ~${targetWeight}kg`;
    else if (i === 2) label = `First real progress check — ~${targetWeight}kg (${pctToGoal}% of the way)`;
    else if (i === 3) label = `Halfway checkpoint — ~${targetWeight}kg (${pctToGoal}% of the way)`;
    else label = `Final stretch — ~${targetWeight}kg (${pctToGoal}% of the way)`;

    return { day, label };
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 page-fade-in">
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-sm font-medium mb-1">Day {dayNum} of {programDays}</p>
        <p className="text-xs text-neutral-400 mb-4">{verb} toward {cp.goal_weight}kg ({totalChange}kg {goalType === 'lose' ? 'to lose' : 'to gain'} from {cp.start_weight}kg)</p>
        <div className="flex flex-col gap-2">
          {milestones.map((m) => {
            const done = dayNum > m.day;
            const active = !done && dayNum >= m.day - 3;
            return (
              <div key={m.day} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm ${done ? 'border-brand bg-brand-light' : active ? 'border-amber-400 bg-amber-50' : 'border-border'}`}>
                <span className={done ? 'text-brand-dark' : active ? 'text-amber-600' : 'text-neutral-300'}>{done ? '✓' : '○'}</span>
                <span className={`flex-1 ${done ? 'text-brand-dark' : active ? 'text-amber-700' : 'text-neutral-500'}`}>{m.label}</span>
                <span className="text-2xs text-neutral-400">Day {m.day}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
