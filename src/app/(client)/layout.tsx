import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AppNav from '@/components/AppNav';

// Persistent shell for the 4 client-facing tabs (Today/Nutrition/Progress/
// Milestones) — previously each page.tsx rendered its own <AppNav/> plus
// the same auth-guard boilerplate, so the header was unmounted and
// rebuilt from scratch on every single tab switch. One shell here means
// AppNav survives navigation between these routes.
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login'); // middleware already guarantees this, but keeps the group safe standalone

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'coach') redirect('/coach');

  return (
    <div className="min-h-screen">
      <AppNav />
      {children}
    </div>
  );
}
