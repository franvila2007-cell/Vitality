import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AppNav from '@/components/AppNav';

export default async function NutritionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'coach') redirect('/coach');

  return (
    <div className="min-h-screen">
      <AppNav />
      <div className="max-w-2xl mx-auto px-4 py-10 text-sm text-neutral-400">
        Saved meals &amp; extended nutrition history — coming soon. Log meals from the Today tab in the meantime.
      </div>
    </div>
  );
}
