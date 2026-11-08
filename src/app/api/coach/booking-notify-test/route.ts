import { createAdminClient } from '@/lib/supabase/admin';
import { json, requireCoach } from '@/lib/bookingServer';
import { buildCoachBookingEmail } from '@/lib/bookingNotify';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// "Send me a test": the coach presses it in Client booking and gets a sample
// booking email, so they can see exactly what a real one looks like.
export async function POST() {
  const who = await requireCoach();
  if ('error' in who) return who.error;
  const from = process.env.RESEND_REMINDER_FROM;
  if (!process.env.RESEND_API_KEY || !from) return json({ error: 'Emails aren’t set up yet (no sender address).' }, 503);
  const { data: me } = await createAdminClient().from('profiles').select('email').eq('id', who.userId).maybeSingle();
  const to = process.env.BOOKING_NOTIFY_EMAIL || 'franvila2007@gmail.com';
  const start = new Date(Date.now() + 2 * 86400000);
  start.setMinutes(0, 0, 0);
  const mail = buildCoachBookingEmail({ event: 'booked', clientName: 'Test Client', kind: 'check_in', startsAt: start.toISOString() });
  try {
    await sendEmail({ from, to, replyTo: me?.email, subject: `[TEST] ${mail.subject}`, html: mail.html, text: mail.text });
    return json({ ok: true, to });
  } catch {
    return json({ error: 'The test email couldn’t be sent — check the sender in Resend.' }, 502);
  }
}
