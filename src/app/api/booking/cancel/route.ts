import { after } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { json, requireClient } from '@/lib/bookingServer';
import { notifyCoach } from '@/lib/bookingNotify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A client cancels one of their own upcoming calls (frees the slot).
export async function POST(req: Request) {
  const who = await requireClient({ requireAccess: false });
  if ('error' in who) return who.error;
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Missing call.' }, 400);
  const admin = createAdminClient();
  const { data, error } = await admin.from('coach_calls').update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', parsed.data.id).eq('client_id', who.userId).eq('status', 'scheduled').gt('starts_at', new Date().toISOString()).select('id, kind, starts_at');
  if (error) return json({ error: 'Couldn’t cancel — please try again.' }, 500);
  if (!data || data.length === 0) return json({ error: 'That call can’t be cancelled any more.' }, 404);
  const call = data[0];
  after(async () => {
    const { data: p } = await admin.from('profiles').select('full_name, email').eq('id', who.userId).maybeSingle();
    await notifyCoach(admin, { event: 'cancelled', callId: call.id, clientName: p?.full_name || p?.email || '', kind: call.kind as 'check_in' | 'info', startsAt: call.starts_at }, { replyTo: p?.email });
  });
  return json({ ok: true });
}
