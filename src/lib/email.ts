import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

// Sends one email through Resend. Server-only.
export type EmailMessage = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  /** Resend de-duplicates repeats of the same key, so a retry can never double-send. (REST sends only.) */
  idempotencyKey?: string;
  /**
   * A calendar invitation. Gmail / Google Calendar only turn it into an event when it is an
   * inline text/calendar part of the email (not a plain attachment), which Resend's REST API can't
   * produce — so these go through Resend's SMTP endpoint instead (same API key, same verified domain).
   */
  invite?: { method: 'REQUEST' | 'CANCEL'; content: string };
};

/** The message as nodemailer builds it (exported so the MIME structure can be tested). */
export function mailOptions(m: EmailMessage): Mail.Options {
  return {
    from: m.from, to: m.to, replyTo: m.replyTo, subject: m.subject, text: m.text, html: m.html,
    ...(m.invite ? { icalEvent: { method: m.invite.method, content: m.invite.content, filename: 'invite.ics' } } : {}),
  };
}

export async function sendEmail(m: EmailMessage): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');

  if (m.invite) {
    const transport = nodemailer.createTransport({
      host: 'smtp.resend.com', port: 465, secure: true, auth: { user: 'resend', pass: key },
      connectionTimeout: 15_000, socketTimeout: 20_000,
    });
    try {
      await transport.sendMail(mailOptions(m));
    } catch (e) {
      throw new Error(`Resend rejected the email (SMTP): ${e instanceof Error ? e.message.slice(0, 200) : 'failed'}`);
    }
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(m.idempotencyKey ? { 'Idempotency-Key': m.idempotencyKey } : {}),
    },
    body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend rejected the email (${res.status}): ${(await res.text()).slice(0, 200)}`);
}
