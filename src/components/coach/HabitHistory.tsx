import { addDays } from '@/lib/date';
import { isHabitDue, scheduleLabel, type Habit } from '@/lib/habits';

const DAYS = 14;

// What a client has actually been doing with their habits, for the coach:
// every habit (including the ones the client added themselves), today's
// status, and a 14-day strip per habit — filled = done, outlined = due and
// missed, faint dot = not due that day.
export default function HabitHistory({ habits, doneByDate, today, firstName }: {
  habits: Habit[];
  doneByDate: Map<string, Set<string>>;
  today: string;
  firstName: string;
}) {
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, -(DAYS - 1 - i)));
  const active = habits.filter((h) => !h.archived_on || h.archived_on > today);
  const archived = habits.filter((h) => h.archived_on && h.archived_on <= today);

  const stats = (h: Habit) => {
    let due = 0, done = 0;
    for (const d of days) {
      if (d === today && !doneByDate.get(d)?.has(h.id)) continue; // today isn't missed yet
      if (!isHabitDue(h, d)) continue;
      due++;
      if (doneByDate.get(d)?.has(h.id)) done++;
    }
    return { due, done, pct: due ? Math.round((done / due) * 100) : null };
  };

  const dueToday = active.filter((h) => isHabitDue(h, today));
  const doneToday = dueToday.filter((h) => doneByDate.get(today)?.has(h.id)).length;
  const shortDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  const Row = ({ h, dim }: { h: Habit; dim?: boolean }) => {
    const { due, done, pct } = stats(h);
    return (
      <div className={`py-3 ${dim ? 'opacity-60' : ''}`}>
        <div className="flex items-start gap-2 mb-2">
          <span className="text-base leading-5">{h.emoji || '✅'}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-5">
              {h.label}
              {h.added_by === 'client' && <span className="ml-1.5 align-middle rounded-full bg-brand-light text-brand-dark text-3xs font-semibold uppercase tracking-wide px-1.5 py-0.5">{firstName}&rsquo;s own</span>}
            </p>
            <p className="text-2xs text-neutral-400">{scheduleLabel(h)}{h.archived_on ? ` · removed ${shortDay(h.archived_on)}` : ''}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-semibold tabular-nums">{pct == null ? '—' : `${pct}%`}</p>
            <p className="text-3xs text-neutral-400 tabular-nums">{due ? `${done}/${due} days` : 'not due yet'}</p>
          </div>
        </div>
        <div className="flex gap-1">
          {days.map((d) => {
            const dueDay = isHabitDue(h, d);
            const done = !!doneByDate.get(d)?.has(h.id);
            const isToday = d === today;
            return (
              <span
                key={d}
                title={`${shortDay(d)} — ${done ? 'done' : dueDay ? (isToday ? 'not yet' : 'missed') : 'not due'}`}
                className={`flex-1 h-5 rounded-md ${
                  done ? 'bg-brand' : dueDay ? (isToday ? 'border border-neutral-300 bg-neutral-50' : 'border border-status-bad/40 bg-status-bad-bg') : 'bg-neutral-100/70'
                } ${isToday ? 'ring-1 ring-neutral-400/60' : ''}`}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <p className="text-sm font-medium">Habits</p>
        <p className="text-2xs text-neutral-400 tabular-nums">{dueToday.length ? `Today ${doneToday}/${dueToday.length}` : 'Nothing due today'}</p>
      </div>
      <p className="text-2xs text-neutral-400 mb-1">Last 14 days · filled = done, red outline = due and missed</p>
      {active.length === 0 && <p className="text-sm text-neutral-400 py-3">No habits set up yet.</p>}
      <div className="flex flex-col divide-y divide-border">
        {active.map((h) => <Row key={h.id} h={h} />)}
      </div>
      {active.length > 0 && (
        <div className="flex justify-between text-3xs text-neutral-400 mt-0.5"><span>{shortDay(days[0])}</span><span>Today</span></div>
      )}
      {archived.length > 0 && (
        <details className="mt-3 border-t border-border pt-2.5 group">
          <summary className="text-2xs font-medium text-neutral-400 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            Removed habits ({archived.length}) <span className="inline-block transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="flex flex-col divide-y divide-border">
            {archived.map((h) => <Row key={h.id} h={h} dim />)}
          </div>
        </details>
      )}
    </div>
  );
}
