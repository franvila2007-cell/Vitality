import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AppNav from '@/components/AppNav';
import TodayClient from '@/components/TodayClient';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login'); // middleware already guarantees this, but keeps the page safe standalone

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'coach') redirect('/coach');

  return (
    <div className="min-h-screen">
      <AppNav />
      <TodayClient />
    </div>
  );
}
