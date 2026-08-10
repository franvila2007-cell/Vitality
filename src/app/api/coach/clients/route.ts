import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const DEFAULT_HABITS = [
  { key: 'sunlight', label: 'Get 10+ minutes of sunlight', tag: 'Morning' },
  { key: 'caffeine', label: 'No caffeine after 2pm', tag: 'Sleep' },
  { key: 'protein', label: 'Hit your protein target', tag: 'Nutrition' },
  { key: 'treadmill', label: '10k steps / treadmill walk', tag: 'Movement' },
  { key: 'noSnacking', label: 'No mindless snacking', tag: 'Nutrition' },
  { key: 'seedOils', label: 'Avoid seed oils', tag: 'Nutrition' },
  { key: 'eatBeforeBed', label: 'Stop eating 2-3 hours before bed', tag: 'Sleep' },
];

// Coach-only: invites a new client account and provisions their starting
// rows. No public sign-up exists — this is the only way a client account
// gets created (per the confirmed onboarding decision).
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'coach') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json();
  const { email, fullName, startWeight, goalWeight, goalType, goalDate, calories, proteinG, carbsG, fatG } = body as {
    email: string; fullName: string; startWeight: number; goalWeight: number; goalType: 'lose' | 'gain'; goalDate?: string;
    calories: number; proteinG: number; carbsG: number; fatG: number;
  };
  if (!email || !fullName) return NextResponse.json({ error: 'email and fullName are required' }, { status: 400 });

  const admin = createAdminClient();
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { role: 'client', full_name: fullName },
  });
  if (inviteErr || !invited.user) return NextResponse.json({ error: inviteErr?.message || 'invite failed' }, { status: 400 });

  const clientId = invited.user.id;
  const today = new Date().toISOString().slice(0, 10);

  await Promise.all([
    admin.from('client_profiles').insert({
      user_id: clientId, start_date: today, start_weight: startWeight, current_weight: startWeight,
      goal_weight: goalWeight, goal_type: goalType, goal_date: goalDate || null, updated_by: 'coach',
    }),
    admin.from('targets').insert({ user_id: clientId, calories, protein_g: proteinG, carbs_g: carbsG, fat_g: fatG, updated_by: 'coach' }),
    admin.from('habits').insert(DEFAULT_HABITS.map((h, i) => ({ user_id: clientId, key: h.key, label: h.label, tag: h.tag, sort_order: i }))),
  ]);

  return NextResponse.json({ id: clientId, email: invited.user.email });
}
// service key updated 1786399513
