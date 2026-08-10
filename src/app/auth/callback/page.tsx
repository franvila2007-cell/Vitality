'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Handles the link from Supabase's invite/recovery emails. This has to run
// client-side (not a server route handler): Supabase's default email
// templates use the implicit flow, which puts the session token in the URL
// *hash fragment* (#access_token=...) — hash fragments are never sent to a
// server, only visible to browser JS.
//
// @supabase/ssr's createBrowserClient hardcodes flowType: 'pkce', which
// means its built-in detectSessionInUrl logic only looks for a `?code=`
// param and does NOT consume implicit-flow hash tokens — so we can't just
// mount the client and let it auto-detect. Instead, the hash is parsed by
// hand here and the session is set explicitly via setSession(), which
// works regardless of the client's configured flow type. The `?code=`
// (PKCE) and `?token_hash=&type=` cases are also handled explicitly, in
// case the project's email flow ever changes.
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function run() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const tokenHash = params.get('token_hash');
      const type = params.get('type');
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) { setError(true); return; }
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { setError(true); return; }
      } else if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'invite' | 'magiclink' | 'recovery' | 'email' });
        if (error) { setError(true); return; }
      } else {
        setError(true);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError(true); return; }

      router.replace('/auth/set-password');
    }

    run();
  }, [router]);

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
