import { createClient } from '@/lib/supabase/server';
import MilestoneProtocol from '@/components/MilestoneProtocol';
import WorkoutProgress from '@/components/WorkoutProgress';

export default async function ClientMilestonesPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // Server component: "now" per request is exactly what we want here.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const { data: cp } = await supabase.from('client_profiles').select('*').eq('user_id', id).maybeSingle();

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4 page-fade-in">
      {cp ? (
        <MilestoneProtocol cp={cp} nowMs={nowMs} />
      ) : (
        <div className="bg-surface border border-border rounded-2xl p-4 text-sm text-neutral-400">No program set up for this client yet.</div>
      )}
      <WorkoutProgress userId={id} readOnly />
    </div>
  );
}
