import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AppNav from '@/components/AppNav';

const MILESTONES = [
  { day: 0, label: 'Program starts' },
  { day: 14, label: 'Two weeks in — habits should be sticking' },
  { day: 21, label: 'Three weeks — first real progress check' },
  { day: 30, label: 'One month — checkpoint review' },
  { day: 45, label: 'Six weeks — halfway to the finish' },
  { day: 60, label: 'Program complete' },
];

export default async function MilestonesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'coach') redirect('/coach');

  const { data: cp } = await supabase.from('client_profiles').select('start_date, program_length_days').eq('user_id', user.id).maybeSingle();
  const dayNum = cp?.start_date
    ? Math.max(1, Math.min(cp.program_length_days || 60, Math.floor((Date.now() - new Date(cp.start_date).getTime()) / 86400000) + 1))
    : 1;

  return (
    <div className="min-h-screen">
      <AppNav />
      <div className="max-w-2xl mx-auto px-4 py-5">
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-sm font-medium mb-4">Day {dayNum} of {cp?.program_length_days || 60}</p>
          <div className="flex flex-col gap-2">
            {MILESTONES.map((m) => {
              const done = dayNum > m.day;
              const active = !done && dayNum >= m.day - 3;
              return (
                <div key={m.day} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm ${done ? 'border-brand bg-brand-light' : active ? 'border-amber-400 bg-amber-50' : 'border-border'}`}>
                  <span className={done ? 'text-brand-dark' : active ? 'text-amber-600' : 'text-neutral-300'}>{done ? '✓' : '○'}</span>
                  <span className={`flex-1 ${done ? 'text-brand-dark' : active ? 'text-amber-700' : 'text-neutral-500'}`}>{m.label}</span>
                  <span className="text-[11px] text-neutral-400">Day {m.day}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
