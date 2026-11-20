import { createAdminClient } from '@/lib/supabase/admin';
import AcademyCourses from '@/components/AcademyCourses';
import { hasAcademyAccess } from '@/lib/academy';

// The coach's read-only look at a client's Academy: every course (the coach can
// open them) and which ones the client has ticked off.
export default async function ClientAcademyPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const [access, { data: progress }] = await Promise.all([
    hasAcademyAccess(admin, id),
    admin.from('academy_progress').select('course_number').eq('client_id', id),
  ]);
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4 page-fade-in">
      {!access && (
        <div className="rounded-2xl border border-status-warn/30 bg-status-warn-bg px-4 py-3 text-sm text-status-warn-text">
          This client doesn&rsquo;t see the Academy — it&rsquo;s included with 3, 6 and 12-month coaching packages.
        </div>
      )}
      <AcademyCourses userId={id} initialDone={(progress || []).map((p) => p.course_number)} readOnly />
    </div>
  );
}
