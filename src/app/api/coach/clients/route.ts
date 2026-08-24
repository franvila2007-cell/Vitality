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

  // Without an explicit redirectTo, Supabase sends the invite link to the
  // project's default Site URL instead of our callback page — the link
  // still "works" (it verifies the token), it just drops the client on
  // whatever that default is instead of somewhere that knows how to turn
  // the token into a session and prompt for a password.
  const origin = new URL(req.url).origin;
  const admin = createAdminClient();
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { role: 'client', full_name: fullName },
    redirectTo: `${origin}/auth/callback`,
  });

  if (inviteErr || !invited.user) {
    // Supabase Auth enforces a unique email — inviting an address that's
    // already tied to a real auth.users row always fails, permanent-delete
    // or not. That's fine for a genuinely-in-use email, but a coach who
    // "removed" (archived, not deleted) a client and later re-adds them by
    // the same email should get that client back, not a dead end: their
    // account, history, and targets never went away, so bring it back
    // instead of trying (and failing) to create a duplicate.
    const emailTaken = inviteErr?.code === 'email_exists' || /already.*registered|already.*exists|email.*taken/i.test(inviteErr?.message || '');
    if (emailTaken) {
      const { data: existing } = await admin.from('profiles').select('id, role, archived_at, full_name').ilike('email', email).maybeSingle();
      if (existing?.role === 'client' && existing.archived_at) {
        await admin.from('profiles').update({ archived_at: null }).eq('id', existing.id);
        return NextResponse.json({ id: existing.id, email, restored: true });
      }
      if (existing?.role === 'client') {
        return NextResponse.json({ error: `${existing.full_name || email} already has an active account — find them in your client list instead of adding a new one.` }, { status: 400 });
      }
      return NextResponse.json({ error: 'That email is already in use by another account.' }, { status: 400 });
    }
    return NextResponse.json({ error: inviteErr?.message || 'invite failed' }, { status: 400 });
  }

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

  return NextResponse.json({ id: clientId, email: invited.user.email, restored: false });
}
