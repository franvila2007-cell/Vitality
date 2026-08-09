// One-time bootstrap: invites the coach account (there's no public sign-up,
// so the very first account has to be created this way). Supabase sends an
// email with a link to set a password; the on_auth_user_created trigger
// (see migration 0001) reads user_metadata.role to create the matching
// profiles row with role='coach'.
//
// Run with: npx tsx scripts/create-coach.ts <email> "<full name>"

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/supabase/database.types';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const [email, fullName] = process.argv.slice(2);

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}
if (!email) {
  console.error('Usage: npx tsx scripts/create-coach.ts <email> "<full name>"');
  process.exit(1);
}

const supabase = createClient<Database>(url, serviceKey);

async function main() {
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { role: 'coach', full_name: fullName || '' },
  });
  if (error) throw error;
  console.log('Invited coach:', data.user.id, data.user.email);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
