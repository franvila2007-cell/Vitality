// Dev-only: throwaway coach account with a known password, purely to QA the
// /coach routes and RLS policies before the real invite is claimed. Deleted
// after verification — not part of the app's runtime.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/supabase/database.types';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error('Missing env'); process.exit(1); }
const supabase = createClient<Database>(url, serviceKey);

async function main() {
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'test-coach@vitality.local', password: 'TestCoach123!', email_confirm: true,
    user_metadata: { role: 'coach', full_name: 'Test Coach' },
  });
  if (error) throw error;
  console.log('Test coach:', data.user.id);
}
main().catch((e) => { console.error(e); process.exit(1); });
