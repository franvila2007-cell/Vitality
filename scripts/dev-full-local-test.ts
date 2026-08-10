// Generates a recovery link, follows it server-side (capturing the redirect
// Location header, which carries the hash-fragment tokens as plain text —
// no browser needed), then round-trips those tokens through the exact same
// cookie format /api/auth/set-session writes, verified against a real
// @supabase/ssr server client. End-to-end, no consumed user-facing link.
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const email = process.argv[2];
const redirectTo = process.argv[3];

async function main() {
  const admin = createClient(url, serviceKey);
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });
  if (error) throw error;
  const verifyUrl = data.properties.action_link;

  const res = await fetch(verifyUrl, { redirect: 'manual' });
  const location = res.headers.get('location');
  if (!location) throw new Error('no redirect location, status ' + res.status);

  const hash = new URL(location).hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token')!;
  const refresh_token = params.get('refresh_token')!;
  if (!access_token || !refresh_token) throw new Error('no tokens in redirect: ' + location);
  console.log('Got tokens from redirect, access_token len', access_token.length);

  const userRes = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${access_token}`, apikey: anonKey } });
  const user = await userRes.json();
  const payload = JSON.parse(Buffer.from(access_token.split('.')[1], 'base64url').toString('utf8'));
  const session = {
    access_token, refresh_token, token_type: 'bearer',
    expires_at: payload.exp, expires_in: Math.max(0, payload.exp - Math.floor(Date.now() / 1000)), user,
  };
  const projectRef = new URL(url).hostname.split('.')[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const cookieValue = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');

  const fakeCookies = new Map<string, string>([[cookieName, cookieValue]]);
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() { return [...fakeCookies.entries()].map(([name, value]) => ({ name, value })); },
      setAll(cs) { for (const { name, value } of cs) fakeCookies.set(name, value); },
    },
  });
  const { data: { user: readUser }, error: readErr } = await supabase.auth.getUser();
  console.log('READ BACK', JSON.stringify({ error: readErr?.message, email: readUser?.email }));
}
main().catch((e) => { console.error(e); process.exit(1); });
