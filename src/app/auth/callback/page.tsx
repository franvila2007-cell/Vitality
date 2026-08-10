'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Handles the link from Supabase's invite/recovery emails. This has to run
// client-side (not a server route handler): Supabase's default email
// templates use the implicit flow, which puts the session token in the URL
// *hash fragment* (#access_token=...) — hash fragments are never sent to a
// server, only visible to browser JS. The Supabase browser client
// auto-detects and consumes that hash on load (detectSessionInUrl, on by
// default), so simply mounting it here is enough for that case. The
// `?code=` (PKCE) and `?token_hash=&type=` cases are handled explicitly as
// well, in case the project's email flow ever changes.
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

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { setError(true); return; }
      } else if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'invite' | 'magiclink' | 'recovery' | 'email' });
        if (error) { setError(true); return; }
      }

      // Give the browser client a moment to finish processing an implicit
      // hash-fragment session (access_token/refresh_token in the URL hash)
      // if that's what we got instead.
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
