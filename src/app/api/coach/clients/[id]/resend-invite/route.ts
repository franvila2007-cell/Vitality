import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Coach-only: re-sends the Supabase invite email for a client who never
// got it, lost it, or let the link expire. inviteUserByEmail only succeeds
// while the account is still pending (no password set yet) — a client who
// already signed in has nothing to "resend," so that failure is reported
// back as a clear, specific message rather than a generic error.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'coach') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: target } = await supabase.from('profiles').select('role, email, full_name, archived_at').eq('id', id).single();
  if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (target.role !== 'client') return NextResponse.json({ error: 'cannot invite a non-client account' }, { status: 400 });
  if (target.archived_at) return NextResponse.json({ error: 'this client is removed — add them back before resending an invite' }, { status: 400 });

  const origin = new URL(req.url).origin;
  const admin = createAdminClient();
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(target.email, {
    data: { role: 'client', full_name: target.full_name },
    redirectTo: `${origin}/auth/callback`,
  });

  if (inviteErr) {
    const alreadyActive = inviteErr.code === 'email_exists' || /already.*registered|already.*exists/i.test(inviteErr.message || '');
    if (alreadyActive) {
      return NextResponse.json({ error: `${target.full_name || target.email} has already set up their account — there's no pending invite to resend.` }, { status: 400 });
    }
    return NextResponse.json({ error: inviteErr.message || 'Could not resend the invite.' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
