import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import AcademyCourses from '@/components/AcademyCourses';
import { hasAcademyAccess } from '@/lib/academy';

export const metadata = { title: 'Academy · Vitality' };

// The Vitality Academy tab — 1-1 coaching clients only (role guard + nav in
// (client)/layout.tsx).
export default async function AcademyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await hasAcademyAccess(createAdminClient(), user.id))) redirect('/');
  const { data: progress } = await supabase.from('academy_progress').select('course_number').eq('client_id', user.id);
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4 page-fade-in">
      <AcademyCourses userId={user.id} initialDone={(progress || []).map((p) => p.course_number)} />
    </div>
  );
}
