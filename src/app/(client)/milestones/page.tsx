import { createClient } from '@/lib/supabase/server';
import MilestoneProtocol from '@/components/MilestoneProtocol';
import WorkoutProgress from '@/components/WorkoutProgress';

// Auth/role guard and <AppNav/> now live in (client)/layout.tsx — this
// page still needs its own auth call for user.id, just not the redirects.
export default async function MilestonesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null; // layout already redirects; this only satisfies TS

  // Server component: "now" per request is exactly what we want here.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const { data: cp } = await supabase.from('client_profiles').select('*').eq('user_id', user.id).maybeSingle();

  if (!cp) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4 page-fade-in">
        <div className="bg-surface border border-border rounded-2xl p-4 text-sm text-neutral-400">Your coach hasn&rsquo;t set up your program yet.</div>
        <WorkoutProgress />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4 page-fade-in">
      <MilestoneProtocol cp={cp} nowMs={nowMs} />

      <WorkoutProgress />
    </div>
  );
}
