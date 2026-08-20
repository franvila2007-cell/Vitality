import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Coach-only: archives or restores a client. "Removing" a client sets
// archived_at instead of deleting anything — the coach wants to always be
// able to add a removed client back, so every row (targets, food log,
// habits, progress) stays intact and this is just a visibility flag. A
// plain session-scoped update (not the admin/service-role client) is enough
// since profiles_update_self_or_coach already grants the coach write access.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { archived } = (await req.json()) as { archived: boolean };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'coach') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: target } = await supabase.from('profiles').select('role').eq('id', id).single();
  if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (target.role !== 'client') return NextResponse.json({ error: 'cannot archive a non-client account' }, { status: 400 });

  const { error } = await supabase.from('profiles').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
