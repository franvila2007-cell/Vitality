import type { createAdminClient } from '@/lib/supabase/admin';
import { dayLabel, googleEventUrl, maltaParts } from '@/lib/calls';
import { emailButton, escapeHtml as esc } from '@/lib/reminderEmail';
import { sendEmail } from '@/lib/email';
import { APP_URL } from '@/lib/shareLinks';

type Admin = ReturnType<typeof createAdminClient>;

// The confirmation a client gets the moment they book, move or cancel a call in
// the app (the reminder emails come later). It carries the coach's video link
// and an "add to my calendar" button. Pure builder + a sender that never throws.

export type ClientBookingEvent = {
  event: 'booked' | 'moved' | 'cancelled';
  kind: 'check_in' | 'info';
  startsAt: string;
  minutes: number;
  /** the client's full name */
  name: string;
  details: string;
  videoLink: string;
  appUrl: string;
  /** for a move: where it was before */
  previousStartsAt?: string;
};

export function buildClientBookingEmail(e: ClientBookingEvent): { subject: string; html: string; text: string } {
  const callName = e.kind === 'check_in' ? 'check-in call' : 'info call';
  const label = callName[0].toUpperCase() + callName.slice(1);
  const first = e.name.trim().split(/\s+/)[0] || 'there';
  const start = maltaParts(e.startsAt);
  const end = maltaParts(new Date(new Date(e.startsAt).getTime() + e.minutes * 60000));
  const dateLong = dayLabel(start.date, { weekday: 'long', day: 'numeric', month: 'long' });
  const dayShort = dayLabel(start.date, { weekday: 'short', day: 'numeric', month: 'short' });
  const range = `${start.time}–${end.time}`;
  const prev = e.previousStartsAt ? maltaParts(e.previousStartsAt) : null;
  const prevLong = prev ? `${dayLabel(prev.date, { weekday: 'long', day: 'numeric', month: 'long' })} at ${prev.time}` : '';
  const video = e.videoLink.trim();
  const details = e.details.trim();
  const manageUrl = `${e.appUrl}/calls`;

  const subject = e.event === 'booked' ? `Your ${callName} is booked: ${dayShort}, ${start.time}`
    : e.event === 'moved' ? `Your ${callName} has moved to ${dayShort}, ${start.time}`
    : `Your ${callName} on ${dayShort} is cancelled`;
  const heading = e.event === 'booked' ? `Your ${callName} is booked ✓` : e.event === 'moved' ? `Your ${callName} has moved` : `Your ${callName} is cancelled`;

  const calUrl = googleEventUrl({ title: `${label} with Francesco (Vitality)`, startsAt: e.startsAt, minutes: e.minutes, details: [details, video ? `Video call: ${video}` : ''].filter(Boolean).join('\n') });

  const text = e.event === 'cancelled'
    ? [`Hi ${first},`, '', `${heading}.`, `It was booked for ${dateLong}, ${range} (Malta time).`, '', `Want another time? Book it in the app: ${manageUrl}`, '', '— Vitality'].join('\n')
    : [
      `Hi ${first},`, '', `${heading}.`, '',
      `${label} with Francesco`, `${dateLong}, ${range} (Malta time)`,
      ...(prev ? [`(It was ${prevLong}.)`] : []),
      ...(details ? ['', details] : []),
      ...(video ? ['', `Join the video call: ${video}`] : []),
      '', `Need a different time? Change or cancel it in the app: ${manageUrl}`,
      `Add it to your Google Calendar: ${calUrl}`,
      '', '— Vitality',
    ].join('\n');

  const card = e.event === 'cancelled'
    ? `<div style="border-radius:12px;background:#fdecec;padding:16px;margin:0 0 16px;"><p style="margin:0;font-size:15px;">It was booked for ${esc(dateLong)}, ${esc(range)} <span style="color:#666666;">(Malta time)</span>.</p></div>`
    : `<div style="border-radius:12px;background:#e8f7f3;padding:16px;margin:0 0 16px;">
<p style="margin:0;font-size:16px;font-weight:600;">${esc(label)} with Francesco</p>
<p style="margin:4px 0 0;font-size:15px;">${esc(dateLong)}</p>
<p style="margin:2px 0 0;font-size:15px;">${esc(range)} <span style="color:#666666;">(Malta time, one hour)</span></p>
${prev ? `<p style="margin:6px 0 0;font-size:13px;color:#666666;">Was: ${esc(prevLong)}</p>` : ''}
</div>`;
  const buttons = e.event === 'cancelled'
    ? emailButton(manageUrl, 'Book another time', true)
    : `${video ? emailButton(video, 'Join video call', true) : ''}${emailButton(manageUrl, 'View or change my call', !video)}${emailButton(calUrl, 'Add to Google Calendar', false)}`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#222222;">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;">
<p style="margin:0 0 4px;font-size:13px;color:#12a39a;font-weight:600;letter-spacing:.04em;text-transform:uppercase;">Vitality</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">${esc(heading)}</h1>
<p style="margin:0 0 16px;font-size:15px;">Hi ${esc(first)},</p>
${card}
${e.event !== 'cancelled' && details ? `<p style="margin:0 0 16px;font-size:15px;white-space:pre-line;">${esc(details)}</p>` : ''}
${e.event !== 'cancelled' && video ? `<p style="margin:0 0 16px;font-size:14px;color:#555555;">Video call link: <a href="${esc(video)}" style="color:#12a39a;">${esc(video)}</a></p>` : ''}
<p style="margin:0 0 4px;">${buttons}</p>
</div>
<p style="max-width:480px;margin:12px auto 0;font-size:12px;color:#888888;text-align:center;">You’re getting this because you booked a call in the Vitality app.</p>
</body></html>`;
  return { subject, html, text };
}

/**
 * Emails the client their confirmation. Follows the "email clients" switch (the same one as the
 * reminders), skips archived clients, and never throws — the booking itself must not depend on it.
 */
export async function emailClientBooking(
  admin: Admin,
  clientId: string,
  e: { event: ClientBookingEvent['event']; kind: 'check_in' | 'info'; startsAt: string; previousStartsAt?: string; minutes?: number },
): Promise<void> {
  try {
    const from = process.env.RESEND_REMINDER_FROM;
    if (!process.env.RESEND_API_KEY || !from) return;
    const [{ data: s }, { data: p }] = await Promise.all([
      admin.from('coach_settings').select('call_details, video_link, reminder_emails_enabled').eq('id', 1).maybeSingle(),
      admin.from('profiles').select('full_name, email, role, archived_at').eq('id', clientId).maybeSingle(),
    ]);
    if (s && !s.reminder_emails_enabled) return;
    if (!p || p.role !== 'client' || p.archived_at || !p.email) return;
    const mail = buildClientBookingEmail({
      event: e.event, kind: e.kind, startsAt: e.startsAt, minutes: e.minutes ?? 60, name: p.full_name,
      details: s?.call_details ?? '', videoLink: s?.video_link ?? '', appUrl: APP_URL, previousStartsAt: e.previousStartsAt,
    });
    // No idempotency key on purpose: it runs once per action, and a client who cancels and
    // re-books the same slot must still get the second confirmation.
    await sendEmail({ from, replyTo: process.env.NOTIFY_EMAIL, to: p.email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    console.warn('[client-booking-email] failed', err instanceof Error ? err.message : err);
  }
}
