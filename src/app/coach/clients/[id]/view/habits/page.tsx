import { createClient } from '@/lib/supabase/server';
import { addDays, coachToday } from '@/lib/date';
import { fetchAll } from '@/lib/supabase/paginate';
import HabitCalendar from '@/components/habits/HabitCalendar';
import HabitHistory from '@/components/coach/HabitHistory';
import { completionsByDate, type Habit } from '@/lib/habits';

const HISTORY_DAYS = 180;

// Coach's read-only mirror of the client's Habits tab: the same calendar
// (no ticking) plus every habit with its completion rate and a 14-day strip,
// including the ones the client added themselves.
export default async function ClientHabitsPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // Malta's calendar day, like the rest of the coach app.
  const today = coachToday();
  const since = addDays(today, -HISTORY_DAYS);
  const [habitsRes, completions, profileRes] = await Promise.all([
    supabase.from('habits').select('*').eq('user_id', id).order('sort_order', { ascending: true }),
    // A busy client easily has >1000 ticks in 180 days — page through them all.
    fetchAll<{ habit_id: string; date: string }>((from, to) =>
      supabase.from('habit_completions').select('habit_id, date').eq('user_id', id).eq('completed', true).gte('date', since).order('date', { ascending: false }).range(from, to)),
    supabase.from('profiles').select('full_name, email').eq('id', id).single(),
  ]);
  const habits = (habitsRes.data || []) as Habit[];
  const done: Record<string, string[]> = {};
  for (const r of completions) (done[r.date] ||= []).push(r.habit_id);
  const firstName = (profileRes.data?.full_name || profileRes.data?.email || 'Client').trim().split(/\s+/)[0];

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4 page-fade-in">
      <HabitHistory habits={habits} doneByDate={completionsByDate(completions)} today={today} firstName={firstName} />
      <HabitCalendar habits={habits} done={done} today={today} minMonth={since.slice(0, 8) + '01'} />
    </div>
  );
}
