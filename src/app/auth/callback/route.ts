import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Handles the link from Supabase's invite/magic-link emails. Modern Supabase
// projects use the PKCE flow (?code=...); this also falls back to the older
// token_hash/type verification flow in case the project is configured for it.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = '/auth/set-password';

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'invite' | 'magiclink' | 'recovery' | 'email' });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=invite_link_invalid`);
}
