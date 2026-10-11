import { createClient } from '@/lib/supabase/server';
import { addDays } from '@/lib/date';
import HabitCalendar from '@/components/habits/HabitCalendar';
import { isHabitActive, scheduleLabel } from '@/lib/habits';

const HISTORY_DAYS = 180;

// Coach's read-only mirror of the client's Habits tab: the same calendar
// (no ticking) plus their habit list, including the ones they added.
export default async function ClientHabitsPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // UTC-based like the preview's Today page.
  const today = new Date().toISOString().slice(0, 10);
  const [habitsRes, completionsRes] = await Promise.all([
    supabase.from('habits').select('*').eq('user_id', id).order('sort_order', { ascending: true }),
    supabase.from('habit_completions').select('habit_id, date').eq('user_id', id).eq('completed', true).gte('date', addDays(today, -HISTORY_DAYS)),
  ]);
  const habits = habitsRes.data || [];
  const done: Record<string, string[]> = {};
  for (const r of completionsRes.data || []) (done[r.date] ||= []).push(r.habit_id);
  const active = habits.filter((h) => isHabitActive(h, today));

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4 page-fade-in">
      <HabitCalendar habits={habits} done={done} today={today} minMonth={addDays(today, -HISTORY_DAYS).slice(0, 8) + '01'} />
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-sm font-medium mb-3">Their habits</p>
        {active.length === 0 && <p className="text-sm text-neutral-400">No habits yet.</p>}
        <div className="flex flex-col gap-2">
          {active.map((h) => (
            <div key={h.id} className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-3">
              <span className="w-9 h-9 rounded-full bg-neutral-50 flex items-center justify-center text-lg flex-shrink-0">{h.emoji || '✅'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{h.label}</p>
                <p className="text-2xs text-neutral-400">{scheduleLabel(h)} · {h.added_by === 'client' ? 'added by client' : 'set by you'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
