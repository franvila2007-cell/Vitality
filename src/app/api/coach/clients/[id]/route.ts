import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Coach-only: permanently removes a client account. Every per-client table
// (targets, food_log_entries, habits, custom_foods, etc.) has an
// `on delete cascade` FK back to profiles.id, which itself cascades from
// auth.users.id — so deleting the auth user is enough to wipe all of their
// data in one call, nothing to clean up table-by-table.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'coach') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: target } = await supabase.from('profiles').select('role').eq('id', id).single();
  if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (target.role !== 'client') return NextResponse.json({ error: 'cannot delete a non-client account' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
