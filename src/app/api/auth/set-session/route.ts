import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Takes access_token/refresh_token read from a URL hash fragment (client-
// side only — see /auth/callback) and establishes the session server-side.
//
// This deliberately does NOT call the Supabase SDK's setSession() — that
// consistently threw "Cannot convert argument to a ByteString" (wrapped as
// AuthRetryableFetchError, status 0, meaning the SDK's *internal* fetch call
// never completed) only on Vercel, never locally, across multiple isolated
// tests with confirmed-valid tokens and non-sensitive env vars. Root cause
// unresolved after extensive isolation — something in how that runtime
// constructs the SDK's outgoing request. The REST call below performs the
// equivalent work directly and was verified to work reliably in the same
// environment, so it's used instead: confirm the token via Supabase's
// /auth/v1/user endpoint, then write the session cookie in the same format
// @supabase/ssr itself reads (`sb-<project-ref>-auth-token`, a
// `base64-` + base64url-encoded JSON session object), so every other part
// of the app (which does use the normal @supabase/ssr server client) reads
// the session back exactly as it would if setSession() had written it.
export async function POST(req: Request) {
  try {
    const { access_token, refresh_token } = (await req.json()) as { access_token?: string; refresh_token?: string };
    if (!access_token || !refresh_token) return NextResponse.json({ error: 'missing tokens' }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: 'server misconfigured', hasUrl: !!supabaseUrl, hasKey: !!anonKey }, { status: 500 });
    }
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${access_token}`, apikey: anonKey },
    });
    if (!userRes.ok) return NextResponse.json({ error: 'invalid or expired token', userStatus: userRes.status }, { status: 400 });
    const user = await userRes.json();

    let expiresAt: number;
    try {
      const payload = JSON.parse(Buffer.from(access_token.split('.')[1], 'base64url').toString('utf8'));
      expiresAt = payload.exp;
    } catch {
      return NextResponse.json({ error: 'malformed access token' }, { status: 400 });
    }

    const session = {
      access_token,
      refresh_token,
      token_type: 'bearer',
      expires_at: expiresAt,
      expires_in: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
      user,
    };

    const cookieStore = await cookies();
    cookieStore.set(`sb-${projectRef}-auth-token`, 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), {
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      maxAge: 400 * 24 * 60 * 60,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error;
    console.error('set-session crashed', err);
    return NextResponse.json({ error: err?.message || String(e), name: err?.name, stack: err?.stack }, { status: 500 });
  }
}
