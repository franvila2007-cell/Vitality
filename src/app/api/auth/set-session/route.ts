import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Takes access_token/refresh_token read from a URL hash fragment (client-
// side only — see /auth/callback) and establishes the session server-side.
// This exists because @supabase/ssr's *browser* client throws
// AuthSessionMissingError when calling setSession() directly on a fresh
// client (a known library quirk), even with valid tokens — the *server*
// client's cookie adapter doesn't hit the same path, so doing it here
// works reliably.
export async function POST(req: Request) {
  const { access_token, refresh_token } = (await req.json()) as { access_token?: string; refresh_token?: string };
  if (!access_token || !refresh_token) return NextResponse.json({ error: 'missing tokens' }, { status: 400 });

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) {
      console.error('setSession error', { message: error.message, name: error.name, status: error.status, cause: (error as unknown as { cause?: unknown }).cause });
      return NextResponse.json({ error: error.message, name: error.name, status: error.status }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error;
    console.error('setSession threw', { message: err?.message, name: err?.name, stack: err?.stack, cause: (err as unknown as { cause?: unknown })?.cause });
    return NextResponse.json({ error: err?.message, name: err?.name, stack: err?.stack }, { status: 500 });
  }
}
// trigger fresh build 1786360690
