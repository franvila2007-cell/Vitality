import { createAdminClient } from '@/lib/supabase/admin';
import { buildIcs } from '@/lib/calls';
import type { CoachCallRow } from '@/lib/supabase/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The coach's calls as a subscribable calendar. Google Calendar → "Other
// calendars" → "From URL" polls this; the long random token in the path is the
// only credential (read from coach_calendar_feed, rotatable from the calendar
// page). Contains names and call times only — no notes about health or food.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: feed } = await admin.from('coach_calendar_feed').select('token').eq('id', 1).maybeSingle();
  if (!feed || token.length < 20 || token !== feed.token) return new Response('Not found', { status: 404 });

  const from = new Date(Date.now() - 60 * 86400000).toISOString();
  const to = new Date(Date.now() + 366 * 86400000).toISOString();
  const { data: rows } = await admin.from('coach_calls').select('*').in('status', ['scheduled', 'done'])
    .gte('starts_at', from).lte('starts_at', to).order('starts_at').limit(2000);
  const calls = (rows || []) as CoachCallRow[];

  const clientIds = [...new Set(calls.map((c) => c.client_id).filter((x): x is string => !!x))];
  const contactIds = [...new Set(calls.map((c) => c.contact_id).filter((x): x is string => !!x))];
  const [{ data: profiles }, { data: contacts }] = await Promise.all([
    clientIds.length ? admin.from('profiles').select('id, full_name, email').in('id', clientIds) : Promise.resolve({ data: [] }),
    contactIds.length ? admin.from('crm_contacts').select('id, full_name').in('id', contactIds) : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map<string, string>();
  for (const p of profiles || []) nameOf.set(p.id, p.full_name || p.email);
  for (const c of contacts || []) nameOf.set(c.id, c.full_name);

  const body = buildIcs(calls.map((call) => ({ call, name: nameOf.get(call.client_id ?? call.contact_id ?? '') || 'Client' })));
  return new Response(body, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300' },
  });
}
