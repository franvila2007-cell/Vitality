import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TargetsEditor from '@/components/coach/TargetsEditor';

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'coach') redirect('/');

  const [profileRes, clientProfileRes, targetsRes, checkpointsRes, historyRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).single(),
    supabase.from('client_profiles').select('*').eq('user_id', id).maybeSingle(),
    supabase.from('targets').select('*').eq('user_id', id).maybeSingle(),
    supabase.from('weight_checkpoints').select('*').eq('user_id', id).order('month_index'),
    supabase.from('food_log_entries').select('date, calories, protein_g, carbs_g, fat_g').eq('user_id', id).order('date', { ascending: false }).limit(500),
  ]);

  if (profileRes.error || !profileRes.data) notFound();
  const clientProfile = clientProfileRes.data;
  const targets = targetsRes.data;

  const byDate = new Map<string, { cal: number; prot: number; carb: number; fat: number; count: number }>();
  for (const row of historyRes.data || []) {
    const cur = byDate.get(row.date) || { cal: 0, prot: 0, carb: 0, fat: 0, count: 0 };
    cur.cal += row.calories; cur.prot += row.protein_g; cur.carb += row.carbs_g; cur.fat += row.fat_g; cur.count += 1;
    byDate.set(row.date, cur);
  }
  const historyDays = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 30);

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-10 bg-surface border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center">
          <Link href="/coach" className="text-sm text-neutral-400 hover:text-neutral-700">&larr; Clients</Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-medium">{profileRes.data.full_name || profileRes.data.email}</h1>
          <p className="text-sm text-neutral-400">{profileRes.data.email}</p>
        </div>

        {clientProfile ? (
          <div className="bg-surface border border-border rounded-2xl p-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="Start" value={`${clientProfile.start_weight}kg`} />
            <Stat label="Current" value={`${clientProfile.current_weight}kg`} />
            <Stat label="Goal" value={`${clientProfile.goal_weight}kg (${clientProfile.goal_type})`} />
          </div>
        ) : (
          <p className="text-sm text-neutral-400">No program set up for this client yet.</p>
        )}

        {checkpointsRes.data && checkpointsRes.data.length > 0 && (
          <div className="bg-surface border border-border rounded-2xl p-4">
            <p className="text-sm font-medium mb-2">Weight checkpoints</p>
            <div className="flex gap-3 flex-wrap">
              {checkpointsRes.data.map((c) => (
                <span key={c.id} className="text-xs bg-neutral-50 rounded-full px-3 py-1">Month {c.month_index}: {c.weight}kg</span>
              ))}
            </div>
          </div>
        )}

        <TargetsEditor userId={id} initial={targets} />

        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-sm font-medium mb-3">Daily intake history</p>
          {historyDays.length === 0 && <p className="text-sm text-neutral-400">No entries logged yet.</p>}
          <div className="flex flex-col divide-y divide-border">
            {historyDays.map(([date, t]) => (
              <div key={date} className="flex items-center justify-between py-2 text-sm">
                <span className="text-neutral-500">{date}</span>
                <span className="text-neutral-700">{Math.round(t.cal)} kcal · {Math.round(t.prot)}p {Math.round(t.carb)}c {Math.round(t.fat)}f</span>
                <span className="text-[11px] text-neutral-400">{t.count} {t.count === 1 ? 'entry' : 'entries'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-50 rounded-lg py-2">
      <div className="text-[10px] uppercase text-neutral-400">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
