// Server-side Supabase client — used in server components, server actions,
// and route handlers. Reads/writes the session via Next.js cookies() so RLS
// sees the logged-in user (auth.uid()).
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component with no response to attach to —
            // safe to ignore as long as middleware.ts is also refreshing the session
          }
        },
      },
    }
  );
}
