// Browser-side Supabase client — used in client components (chat input,
// habit toggles, etc). Auth is cookie-based (see middleware.ts), so this
// client automatically picks up the logged-in session.
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
