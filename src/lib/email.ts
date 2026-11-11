// Sends one email through Resend. Server-only.
export type EmailMessage = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  /** Resend de-duplicates repeats of the same key, so a retry can never double-send. */
  idempotencyKey?: string;
  /** e.g. a calendar invite: content is the raw text, contentType e.g. 'text/calendar; charset=UTF-8; method=REQUEST' */
  attachments?: { filename: string; content: string; contentType?: string }[];
};

export async function sendEmail(m: EmailMessage): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(m.idempotencyKey ? { 'Idempotency-Key': m.idempotencyKey } : {}),
    },
    body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}),
      ...(m.attachments?.length ? { attachments: m.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content, 'utf8').toString('base64'), ...(a.contentType ? { content_type: a.contentType } : {}) })) } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend rejected the email (${res.status}): ${(await res.text()).slice(0, 200)}`);
}
