import type { createAdminClient } from '@/lib/supabase/admin';
import { dayLabel, maltaParts } from '@/lib/calls';
import { sendEmail } from '@/lib/email';
import { APP_URL } from '@/lib/shareLinks';

type Admin = ReturnType<typeof createAdminClient>;

// Tells the coach by email when a client books, moves or cancels a call in the
// app. Sent through Resend from the verified reminder sender; replies go to the
// client. A failure here never affects the booking itself.

const TO = process.env.BOOKING_NOTIFY_EMAIL || 'franvila2007@gmail.com';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export type BookingEvent = {
  event: 'booked' | 'moved' | 'cancelled';
  clientName: string;
  kind: 'check_in' | 'info';
  startsAt: string;
  /** for a move: where it was before */
  previousStartsAt?: string;
};

const fmt = (iso: string) => {
  const p = maltaParts(iso);
  return { day: dayLabel(p.date, { weekday: 'short', day: 'numeric', month: 'short' }), time: p.time, long: `${dayLabel(p.date, { weekday: 'long', day: 'numeric', month: 'long' })} at ${p.time}` };
};

export function buildCoachBookingEmail(e: BookingEvent): { subject: string; html: string; text: string } {
  const call = e.kind === 'check_in' ? 'check-in call' : 'info call';
  const when = fmt(e.startsAt);
  const name = e.clientName.trim() || 'A client';
  const prev = e.previousStartsAt ? fmt(e.previousStartsAt) : null;
  const headline = e.event === 'booked' ? `${name} booked their ${call}`
    : e.event === 'moved' ? `${name} moved their ${call}`
    : `${name} cancelled their ${call}`;
  const subject = e.event === 'booked' ? `📅 ${name} booked a ${call} — ${when.day} ${when.time}`
    : e.event === 'moved' ? `🔁 ${name} moved their ${call} — now ${when.day} ${when.time}`
    : `❌ ${name} cancelled their ${call} (${when.day} ${when.time})`;
  const lines = e.event === 'moved' && prev
    ? [`Now: ${when.long}`, `Was: ${prev.long}`]
    : e.event === 'cancelled' ? [`Was booked for: ${when.long}`, 'The slot is free again.'] : [`When: ${when.long}`];
  const link = `${APP_URL}/coach/calendar`;
  const text = [headline, '', ...lines, '(Malta time)', '', `Open your calendar: ${link}`].join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#222;">
<div style="max-width:460px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;">
<p style="margin:0 0 4px;font-size:12px;color:#12a39a;font-weight:600;letter-spacing:.04em;text-transform:uppercase;">Vitality · booking</p>
<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;">${esc(headline)}</h1>
<div style="border-radius:12px;background:${e.event === 'cancelled' ? '#fdecec' : '#e8f7f3'};padding:14px 16px;margin:0 0 16px;font-size:15px;line-height:1.6;">${lines.map(esc).join('<br>')}<br><span style="color:#666;font-size:13px;">Malta time</span></div>
<a href="${esc(link)}" style="display:inline-block;padding:11px 18px;border-radius:10px;font-weight:600;font-size:14px;text-decoration:none;background:#12a39a;color:#fff;">Open my calendar</a>
</div></body></html>`;
  return { subject, html, text };
}

/** Sends the notification unless it's switched off or no sender is configured. Never throws. */
export async function notifyCoach(admin: Admin, e: BookingEvent, opts: { replyTo?: string } = {}): Promise<void> {
  try {
    const { data } = await admin.from('coach_settings').select('booking_notify_enabled').eq('id', 1).maybeSingle();
    if (data && !data.booking_notify_enabled) return;
    const mail = buildCoachBookingEmail(e);
    const from = process.env.RESEND_REMINDER_FROM;
    if (!process.env.RESEND_API_KEY || !from) { console.info('[booking-notify] not sent (no sender configured):', mail.subject); return; }
    await sendEmail({ from, to: TO, replyTo: opts.replyTo, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    console.warn('[booking-notify] failed', err instanceof Error ? err.message : err);
  }
}
