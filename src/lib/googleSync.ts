import type { createAdminClient } from '@/lib/supabase/admin';
import { KIND_META, callTitle } from '@/lib/calls';
import type { GoogleCalendarClient } from '@/lib/googleCalendar';

type Admin = ReturnType<typeof createAdminClient>;

/** Stored in coach_settings.google_sync_last_error while Google isn't set up yet. */
export const GOOGLE_NOT_CONFIGURED = 'google_not_configured';
export const GOOGLE_NO_CALENDAR = 'google_no_calendar';

export type SyncResult = { synced: number; removed: number; failed: number; error: string | null };

// Brings the coach's Google Calendar in line with the calls: any call that
// changed since it was last synced is created/moved (scheduled, done, no-show)
// or removed (cancelled) in Google. Safe to run any time and as often as you
// like — events are keyed on the call, and a call is only marked synced if it
// hasn't changed again in the meantime.
export async function runGoogleSync(deps: { admin: Admin; google: GoogleCalendarClient | null; now?: Date; limit?: number }): Promise<SyncResult> {
  const { admin, google } = deps;
  const now = deps.now ?? new Date();
  const out: SyncResult = { synced: 0, removed: 0, failed: 0, error: null };
  const record = () => admin.from('coach_settings').update({ google_sync_last_run_at: now.toISOString(), google_sync_last_error: out.error }).eq('id', 1);

  const { data: settings } = await admin.from('coach_settings').select('google_calendar_id').eq('id', 1).maybeSingle();
  const calendarId = settings?.google_calendar_id?.trim() ?? '';
  if (!google) { out.error = GOOGLE_NOT_CONFIGURED; await record(); return out; }
  if (!calendarId) { out.error = GOOGLE_NO_CALENDAR; await record(); return out; }

  const since = new Date(now.getTime() - 2 * 86400000).toISOString();
  const { data: calls, error } = await admin.from('coach_calls').select('*').gte('starts_at', since).order('updated_at', { ascending: false }).limit(200);
  if (error) { out.error = `database: ${error.message}`; await record(); return out; }
  // Changed since it was last synced (PostgREST can't compare two columns in a filter, so do it here).
  const due = (calls ?? []).filter((c) => !c.google_synced_at || new Date(c.updated_at) > new Date(c.google_synced_at)).slice(0, deps.limit ?? 25);
  if (due.length === 0) { await record(); return out; }

  const clientIds = [...new Set(due.map((c) => c.client_id).filter((x): x is string => !!x))];
  const contactIds = [...new Set(due.map((c) => c.contact_id).filter((x): x is string => !!x))];
  const [{ data: profiles }, { data: contacts }] = await Promise.all([
    clientIds.length ? admin.from('profiles').select('id, full_name, email').in('id', clientIds) : Promise.resolve({ data: [] }),
    contactIds.length ? admin.from('crm_contacts').select('id, full_name').in('id', contactIds) : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map<string, string>();
  for (const p of profiles ?? []) nameOf.set(p.id, p.full_name || p.email);
  for (const c of contacts ?? []) nameOf.set(c.id, c.full_name);

  for (const c of due) {
    try {
      if (c.status === 'cancelled') {
        await google.remove(calendarId, c.id);
        out.removed++;
      } else {
        const name = nameOf.get(c.client_id ?? c.contact_id ?? '') || 'Client';
        await google.upsert(calendarId, {
          callId: c.id, kind: c.kind, title: callTitle(c.kind, name), startsAt: c.starts_at, minutes: c.duration_min,
          description: [KIND_META[c.kind].long, c.note, c.booked_by === 'client' ? 'Booked by the client in the Vitality app.' : ''].filter(Boolean).join('\n'),
        });
        out.synced++;
      }
      // Mark synced only if the call hasn't changed again while we were talking to Google.
      await admin.from('coach_calls').update({ google_synced_at: now.toISOString() }).eq('id', c.id).eq('updated_at', c.updated_at);
    } catch (e) {
      out.failed++;
      out.error ??= e instanceof Error ? e.message.slice(0, 300) : 'sync failed';
    }
  }
  await record();
  return out;
}

/** Syncs straight away if Google is set up (used right after a client books, moves or cancels). Never throws. */
export async function syncGoogleNow(admin: Admin, makeClient: () => GoogleCalendarClient | null): Promise<void> {
  try {
    await runGoogleSync({ admin, google: makeClient() });
  } catch (e) {
    console.warn('[google-sync] failed', e instanceof Error ? e.message : e);
  }
}
