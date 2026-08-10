// One-off: sends a password-reset email to the coach account via Supabase's
// standard recovery flow, redirecting back through /auth/callback (which
// exchanges the recovery link for a session) into /auth/set-password.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const email = process.argv[2];
const redirectTo = process.argv[3];

if (!url || !anonKey) { console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY'); process.exit(1); }
if (!email || !redirectTo) { console.error('Usage: npx tsx scripts/dev-reset-coach-password.ts <email> <redirectTo>'); process.exit(1); }

const supabase = createClient(url, anonKey);

async function main() {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
  console.log('Password reset email sent to', email);
}
main().catch((e) => { console.error(e); process.exit(1); });
