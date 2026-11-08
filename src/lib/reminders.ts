import type { createAdminClient } from '@/lib/supabase/admin';
import { buildReminderEmail } from '@/lib/reminderEmail';
import { APP_URL } from '@/lib/shareLinks';

type Admin = ReturnType<typeof createAdminClient>;

export type Sender = (m: { to: string; subject: string; html: string; text: string; idempotencyKey: string }) => Promise<void>;

export type RunResult = { claimed: number; sent: number; skipped: number; failed: number; error: string | null };

/** Stored in coach_settings.reminder_last_error when emails can't go out because no sender is configured. */
export const NOT_CONFIGURED = 'sender_not_configured';

// Sends the reminders that are due: the claim is done in the database (each
// reminder is handed out exactly once); a send that fails is un-claimed so the
// next run retries it. Nothing is claimed while no sender is configured, so
// reminders aren't lost before emailing is switched on.
export async function runReminders(deps: { admin: Admin; send: Sender | null; now?: Date; pauseMs?: number }): Promise<RunResult> {
  const { admin, send } = deps;
  const now = deps.now ?? new Date();
  const result: RunResult = { claimed: 0, sent: 0, skipped: 0, failed: 0, error: null };
  const record = async () => {
    await admin.from('coach_settings').update({ reminder_last_run_at: now.toISOString(), reminder_last_error: result.error }).eq('id', 1);
  };

  const { data: settings } = await admin.from('coach_settings').select('call_details, reminder_emails_enabled').eq('id', 1).maybeSingle();
  if (settings && !settings.reminder_emails_enabled) { await record(); return result; }
  if (!send) { result.error = NOT_CONFIGURED; await record(); return result; }

  const { data: due, error } = await admin.rpc('claim_due_reminders', { p_now: now.toISOString(), p_max: 12 });
  if (error) { result.error = `claim failed: ${error.message}`; await record(); return result; }
  result.claimed = due?.length ?? 0;
  if (!due || due.length === 0) { await record(); return result; }

  const ids = [...new Set(due.map((d) => d.r_client))];
  const { data: profiles } = await admin.from('profiles').select('id, email, full_name, archived_at, role').in('id', ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  for (const d of due) {
    const p = byId.get(d.r_client);
    const unclaim = () => admin.from('coach_calls').update(d.r_which === 'day' ? { reminded_day_at: null } : { reminded_hour_at: null }).eq('id', d.r_id);
    if (!p || p.role !== 'client' || p.archived_at || !p.email) { result.skipped++; continue; }
    const mail = buildReminderEmail({
      which: d.r_which as 'day' | 'hour', kind: d.r_kind as 'check_in' | 'info', startsAt: d.r_starts_at, minutes: d.r_minutes,
      name: p.full_name, details: settings?.call_details ?? '', appUrl: APP_URL, now,
    });
    try {
      await send({ to: p.email, subject: mail.subject, html: mail.html, text: mail.text, idempotencyKey: `call-${d.r_id}-${d.r_which}-${new Date(d.r_starts_at).getTime()}` });
      result.sent++;
    } catch (e) {
      result.failed++;
      result.error ??= e instanceof Error ? e.message.slice(0, 300) : 'send failed';
      await unclaim();
    }
    // Resend allows about two requests a second.
    if (deps.pauseMs !== 0) await new Promise((res) => setTimeout(res, deps.pauseMs ?? 550));
  }
  await record();
  return result;
}

