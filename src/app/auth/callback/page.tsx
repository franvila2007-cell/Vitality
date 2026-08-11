'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Handles the link from Supabase's invite/recovery emails. This has to run
// client-side (not a server route handler): Supabase's default email
// templates use the implicit flow, which puts the session token in the URL
// *hash fragment* (#access_token=...) — hash fragments are never sent to a
// server, only visible to browser JS.
//
// Two library quirks stack here, both confirmed by direct testing:
// 1. @supabase/ssr's createBrowserClient hardcodes flowType: 'pkce', so its
//    built-in detectSessionInUrl only looks for a `?code=` param and never
//    consumes implicit-flow hash tokens — the hash has to be parsed by hand.
// 2. Calling setSession() directly on that same browser client then throws
//    "AuthSessionMissingError" even with genuinely valid tokens (reproduced
//    with the exact tokens against both the browser and server clients —
//    only the browser client's setSession() fails). So instead of setting
//    the session client-side, the tokens are POSTed to a server route
//    (/api/auth/set-session) where the *server* client's setSession() sets
//    the cookies directly on the response — that path works reliably.
// 3. If the browser already had a *different* signed-in session (e.g. a
//    coach opening a client's invite link in the same browser they're
//    signed into as coach), a background request from the old page
//    (middleware session-refresh, a Link prefetch, etc.) can race this
//    POST and re-write the old session's cookie right after the new one
//    lands. A hard navigation for the final redirect — instead of the
//    Next.js client router — keeps our own page's fetches out of that
//    race; it doesn't fix a *different* tab actively refreshing the old
//    session, so an invite link should still be opened somewhere not
//    already signed in as another account.
export default function AuthCallbackPage() {
  const [error, setError] = useState(false);

  useEffect(() => {
    async function run() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const tokenHash = params.get('token_hash');
      const type = params.get('type');
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken && refreshToken) {
        const res = await fetch('/api/auth/set-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
        });
        if (!res.ok) { setError(true); return; }
      } else if (code || (tokenHash && type)) {
        const supabase = createClient();
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) { setError(true); return; }
        } else {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type as 'invite' | 'magiclink' | 'recovery' | 'email' });
          if (error) { setError(true); return; }
        }
      } else {
        setError(true);
        return;
      }

      // Hard navigation, not the Next.js router: guarantees this transition
      // sends whatever cookie the browser has right now, with no client-side
      // prefetch/refresh request of our own racing the cookie we just set.
      window.location.href = '/auth/set-password';
    }

    run();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-sm text-red-600 mb-2">That link is invalid or has expired.</p>
            <a href="/login" className="text-sm text-brand underline">Back to sign in</a>
          </>
        ) : (
          <p className="text-sm text-neutral-400">Signing you in…</p>
        )}
      </div>
    </div>
  );
}
