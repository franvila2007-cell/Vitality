import { createSign } from 'crypto';

// Writes the coach's booked calls into their Google Calendar. Uses a Google
// "service account" (a robot login) that the coach shares their calendar with
// ("Make changes to events"); its key lives in the GOOGLE_SERVICE_ACCOUNT_JSON
// environment variable and never reaches the browser. Server-only.
//
// One Google event per call, with a stable id derived from the call, so
// creating it twice just updates it, and moving/cancelling finds the same one.

export type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export type GoogleEvent = {
  /** the call's id */
  callId: string;
  title: string;
  description: string;
  startsAt: string;
  minutes: number;
  kind: 'check_in' | 'info';
};

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const API = 'https://www.googleapis.com/calendar/v3/calendars';

export function serviceAccountFromEnv(raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON): ServiceAccount | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!j.client_email || !j.private_key) return null;
    // Keys pasted into env var boxes often have literal "\n" instead of real line breaks.
    return { client_email: j.client_email, private_key: j.private_key.replace(/\\n/g, '\n'), token_uri: j.token_uri };
  } catch {
    return null;
  }
}

/** Google event ids are lowercase a–v and 0–9, 5+ characters. */
export const eventIdFor = (callId: string) => `call${callId.replace(/-/g, '').toLowerCase()}`;

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signJwt(sa: ServiceAccount, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: nowSec, exp: nowSec + 3600 }));
  const sig = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key);
  return `${header}.${claims}.${b64url(sig)}`;
}

type FetchFn = typeof fetch;
let tokenCache: { key: string; token: string; exp: number } | null = null;

async function accessToken(sa: ServiceAccount, f: FetchFn): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.key === sa.client_email && tokenCache.exp - 120 > now) return tokenCache.token;
  const res = await f(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signJwt(sa, now) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}): ${(await res.text()).slice(0, 160)}`);
  const body = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache = { key: sa.client_email, token: body.access_token, exp: now + (body.expires_in ?? 3600) };
  return body.access_token;
}

function resource(e: GoogleEvent) {
  const start = new Date(e.startsAt);
  return {
    summary: e.title,
    description: e.description,
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Malta' },
    end: { dateTime: new Date(start.getTime() + e.minutes * 60000).toISOString(), timeZone: 'Europe/Malta' },
    transparency: 'opaque',
    colorId: e.kind === 'check_in' ? '2' : '3', // sage / grape — the same green and purple as in Vitality
    reminders: { useDefault: true },
    status: 'confirmed',
  };
}

async function explain(res: Response): Promise<Error> {
  const text = (await res.text()).slice(0, 220);
  if (res.status === 404) return new Error('Google can’t find that calendar — check the address, and that you shared the calendar with the Vitality robot (“Make changes to events”).');
  if (res.status === 403) return new Error('Google says no access — share your calendar with the Vitality robot and give it “Make changes to events”.');
  return new Error(`Google answered ${res.status}: ${text}`);
}

export function googleCalendar(sa: ServiceAccount, f: FetchFn = fetch) {
  const call = async (method: string, calendarId: string, path: string, body?: unknown) => {
    const token = await accessToken(sa, f);
    return f(`${API}/${encodeURIComponent(calendarId)}/events${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  };
  return {
    /** Creates the event, or updates it if it already exists. */
    async upsert(calendarId: string, e: GoogleEvent): Promise<void> {
      const id = eventIdFor(e.callId);
      const res = await call('POST', calendarId, '', { id, ...resource(e) });
      if (res.ok) return;
      if (res.status === 409) {
        const upd = await call('PUT', calendarId, `/${id}`, { id, ...resource(e) });
        if (upd.ok) return;
        throw await explain(upd);
      }
      throw await explain(res);
    },
    /** Removes the event; fine if it isn't there. */
    async remove(calendarId: string, callId: string): Promise<void> {
      const res = await call('DELETE', calendarId, `/${eventIdFor(callId)}`);
      if (res.ok || res.status === 404 || res.status === 410) return;
      throw await explain(res);
    },
  };
}

export type GoogleCalendarClient = ReturnType<typeof googleCalendar>;
