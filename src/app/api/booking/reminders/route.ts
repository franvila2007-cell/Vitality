import { createAdminClient } from '@/lib/supabase/admin';
import { json } from '@/lib/bookingServer';
import { sendEmail } from '@/lib/email';
import { runReminders, type Sender } from '@/lib/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Called every 15 minutes by the database (pg_cron → pg_net), like the
// meal-plan worker. It takes no input and returns only counts; each reminder
// is claimed once in the database, so extra calls can't send anything twice.
// Needs RESEND_API_KEY and RESEND_REMINDER_FROM (an address on a domain
// verified in Resend — Resend's shared test sender can only email the account
// owner). Without them nothing is claimed or sent.
export async function POST() {
  const from = process.env.RESEND_REMINDER_FROM;
  const replyTo = process.env.NOTIFY_EMAIL;
  const send: Sender | null = process.env.RESEND_API_KEY && from
    ? (m) => sendEmail({ from, replyTo, to: m.to, subject: m.subject, html: m.html, text: m.text, idempotencyKey: m.idempotencyKey })
    : null;
  try {
    const r = await runReminders({ admin: createAdminClient(), send });
    return json({ claimed: r.claimed, sent: r.sent, skipped: r.skipped, failed: r.failed, ok: r.error === null });
  } catch {
    return json({ ok: false }, 500);
  }
}
