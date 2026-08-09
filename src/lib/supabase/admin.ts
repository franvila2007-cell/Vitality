// Service-role Supabase client — bypasses RLS entirely. Only ever import
// this in server-only code (route handlers, server actions) that needs to
// act outside a specific user's session: inviting new clients (auth admin
// API) and seeding foods_global. NEVER expose SUPABASE_SERVICE_ROLE_KEY to
// the client bundle.
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
