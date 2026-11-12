import type { createAdminClient } from '@/lib/supabase/admin';
import { CALL_MINUTES, KIND_META, buildInviteIcs, callTitle, dayLabel, googleEventUrl, maltaParts } from '@/lib/calls';
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
  /** the coach_calls id — the calendar invitation is keyed on it, so a move/cancel updates the same Google event */
  callId?: string;
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
<a href="${esc(link)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border-radius:10px;font-weight:600;font-size:14px;text-decoration:none;background:#12a39a;color:#fff;">Open my calendar</a>${e.event !== 'cancelled' ? `<a href="${esc(googleEventUrl({ title: callTitle(e.kind, name), startsAt: e.startsAt, minutes: CALL_MINUTES, details: KIND_META[e.kind].long }))}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border-radius:10px;font-weight:600;font-size:14px;text-decoration:none;border:1px solid #d6d6d6;color:#333;">Add to Google Calendar</a>` : ''}
<p style="margin:12px 0 0;font-size:12px;color:#777;">A calendar invitation is included, so this should appear in your Google Calendar automatically. If it doesn’t, use “Add to Google Calendar”.</p>

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
    await sendEmail({ from, to: TO, replyTo: opts.replyTo, subject: mail.subject, html: mail.html, text: mail.text, invite: inviteFor(e, from) });
  } catch (err) {
    console.warn('[booking-notify] failed', err instanceof Error ? err.message : err);
  }
}

/** The calendar invitation (.ics) that puts the call on the coach's Google Calendar — and moves or removes it later. */
export function inviteFor(e: BookingEvent, from: string): { method: 'REQUEST' | 'CANCEL'; content: string } | undefined {
  if (!e.callId) return undefined;
  const method = e.event === 'cancelled' ? 'CANCEL' : 'REQUEST';
  const organizerEmail = /<([^>]+)>/.exec(from)?.[1] ?? from;
  const name = e.clientName.trim() || 'A client';
  const content = buildInviteIcs({
    method, uid: `${e.callId}@vitalitymalta.com`, sequence: Math.floor(Date.now() / 1000),
    title: callTitle(e.kind, name), description: `${KIND_META[e.kind].long}\nBooked by the client in the Vitality app.`,
    startsAt: e.startsAt, minutes: CALL_MINUTES, organizerEmail, attendeeEmail: TO,
  });
  return { method, content };
}
