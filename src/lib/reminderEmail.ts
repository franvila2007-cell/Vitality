import { dayLabel, googleEventUrl, maltaParts } from '@/lib/calls';

// The reminder email a client gets before a call. Pure (no sending) so it can
// be tested; all times are Malta time.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export type ReminderInput = {
  which: 'day' | 'hour';
  kind: 'check_in' | 'info';
  startsAt: string;
  minutes: number;
  /** the client's full name */
  name: string;
  /** how the call happens, written by the coach (optional) */
  details: string;
  appUrl: string;
  now: Date;
};

export function buildReminderEmail(i: ReminderInput): { subject: string; html: string; text: string } {
  const callName = i.kind === 'check_in' ? 'check-in call' : 'info call';
  const label = callName[0].toUpperCase() + callName.slice(1); // "Check-in call" / "Info call"
  const start = maltaParts(i.startsAt);
  const end = maltaParts(new Date(new Date(i.startsAt).getTime() + i.minutes * 60000));
  const today = maltaParts(i.now).date;
  const when = start.date === today ? 'today' : 'tomorrow';
  const first = i.name.trim().split(/\s+/)[0] || 'there';
  const dateLong = dayLabel(start.date, { weekday: 'long', day: 'numeric', month: 'long' });
  const range = `${start.time}–${end.time}`;

  const subject = i.which === 'day'
    ? `Reminder: your ${callName} with Francesco ${when} at ${start.time}`
    : `Starting soon: your ${callName} with Francesco at ${start.time}`;
  const heading = i.which === 'day' ? `Your ${callName} is ${when}` : `Your ${callName} starts in about an hour`;
  const manageUrl = `${i.appUrl}/calls`;
  const calUrl = googleEventUrl({ title: `${label} with Francesco (Vitality)`, startsAt: i.startsAt, minutes: i.minutes, details: i.details });
  const details = i.details.trim();

  const text = [
    `Hi ${first},`, '',
    `${heading}.`, '',
    `${label} with Francesco`, `${dateLong}, ${range} (Malta time)`,
    ...(details ? ['', details] : []),
    '', `Need a different time? You can change or cancel it in the app: ${manageUrl}`,
    `Add it to your Google Calendar: ${calUrl}`,
    '', '— Vitality',
  ].join('\n');

  const button = (href: string, text: string, primary: boolean) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border-radius:10px;font-weight:600;font-size:14px;text-decoration:none;${primary ? 'background:#12a39a;color:#ffffff;' : 'border:1px solid #d6d6d6;color:#333333;'}">${esc(text)}</a>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#222222;">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;">
<p style="margin:0 0 4px;font-size:13px;color:#12a39a;font-weight:600;letter-spacing:.04em;text-transform:uppercase;">Vitality</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">${esc(heading)}</h1>
<p style="margin:0 0 16px;font-size:15px;">Hi ${esc(first)},</p>
<div style="border-radius:12px;background:#e8f7f3;padding:16px;margin:0 0 16px;">
<p style="margin:0;font-size:16px;font-weight:600;">${esc(label)} with Francesco</p>
<p style="margin:4px 0 0;font-size:15px;">${esc(dateLong)}</p>
<p style="margin:2px 0 0;font-size:15px;">${esc(range)} <span style="color:#666666;">(Malta time, one hour)</span></p>
</div>
${details ? `<p style="margin:0 0 16px;font-size:15px;white-space:pre-line;">${esc(details)}</p>` : ''}
<p style="margin:0 0 16px;font-size:14px;color:#555555;">Need a different time? You can change or cancel it in the app.</p>
<p style="margin:0 0 4px;">${button(manageUrl, 'View or change my call', true)}${button(calUrl, 'Add to Google Calendar', false)}</p>
</div>
<p style="max-width:480px;margin:12px auto 0;font-size:12px;color:#888888;text-align:center;">You’re getting this because you booked a call in the Vitality app.</p>
</body></html>`;
  return { subject, html, text };
}
