import { createClient } from '@/lib/supabase/server';
import ProgressClient from '@/components/ProgressClient';
import MilestoneProtocol from '@/components/MilestoneProtocol';

// Auth/role guard and <AppNav/> live in (client)/layout.tsx. Progress = weight,
// badges and the milestone timeline. (The Academy has its own tab.)
export default async function ProgressPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Server component: "now" per request is exactly what we want here.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const { data: cp } = await supabase.from('client_profiles').select('*').eq('user_id', user.id).maybeSingle();

  return (
    <>
      <ProgressClient />
      <div className="max-w-2xl mx-auto px-4 pb-6 flex flex-col gap-4">
        {cp && <MilestoneProtocol cp={cp} nowMs={nowMs} />}
      </div>
    </>
  );
}
