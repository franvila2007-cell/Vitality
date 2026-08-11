import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AppNav from '@/components/AppNav';
import RecipesManager from '@/components/RecipesManager';

export default async function NutritionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'coach') redirect('/coach');

  return (
    <div className="min-h-screen">
      <AppNav />
      <div className="max-w-2xl mx-auto px-4 py-5">
        <RecipesManager />
      </div>
    </div>
  );
}
