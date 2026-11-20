import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import ProgressClient from '@/components/ProgressClient';
import MilestoneProtocol from '@/components/MilestoneProtocol';
import AcademyCourses from '@/components/AcademyCourses';
import { hasAcademyAccess } from '@/lib/academy';

// Auth/role guard and <AppNav/> live in (client)/layout.tsx. Progress = weight,
// badges, the milestone timeline, and the Vitality Academy (1-1 clients).
export default async function ProgressPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Server component: "now" per request is exactly what we want here.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const [{ data: cp }, academy, { data: progress }] = await Promise.all([
    supabase.from('client_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    hasAcademyAccess(createAdminClient(), user.id),
    supabase.from('academy_progress').select('course_number').eq('client_id', user.id),
  ]);

  return (
    <>
      <ProgressClient />
      <div className="max-w-2xl mx-auto px-4 pb-6 flex flex-col gap-4">
        {cp && <MilestoneProtocol cp={cp} nowMs={nowMs} />}
        {academy && <AcademyCourses userId={user.id} initialDone={(progress || []).map((p) => p.course_number)} />}
      </div>
    </>
  );
}
