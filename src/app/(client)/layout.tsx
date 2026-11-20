import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AppNav from '@/components/AppNav';
import { createAdminClient } from '@/lib/supabase/admin';
import { bookingAccess } from '@/lib/bookingAccess';
import { hasAcademyAccess } from '@/lib/academy';

// Persistent shell for the client-facing tabs (Today/Habits/Nutrition/Progress/
// Training) — previously each page.tsx rendered its own <AppNav/> plus
// the same auth-guard boilerplate, so the header was unmounted and
// rebuilt from scratch on every single tab switch. One shell here means
// AppNav survives navigation between these routes.
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login'); // middleware already guarantees this, but keeps the group safe standalone

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'coach') redirect('/coach');

  // The Calls tab (booking) is only for 1-1 coaching clients.
  // The Academy tab: also 1-1 coaching clients only.
  const admin = createAdminClient();
  const [booking, showAcademy] = await Promise.all([bookingAccess(admin, user.id), hasAcademyAccess(admin, user.id)]);
  const showCalls = booking.allowed;

  return (
    <div className="min-h-screen">
      <AppNav showCalls={showCalls} showAcademy={showAcademy} />
      {children}
    </div>
  );
}
