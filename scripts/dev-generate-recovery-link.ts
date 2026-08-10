// Generates a recovery link directly via the admin API instead of sending
// an email — bypasses both the email rate limit and (more importantly)
// email clients that pre-fetch/scan links and silently consume the
// one-time token before the user ever clicks it themselves.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
const redirectTo = process.argv[3];

if (!url || !serviceKey) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!email || !redirectTo) { console.error('Usage: npx tsx scripts/dev-generate-recovery-link.ts <email> <redirectTo>'); process.exit(1); }

const supabase = createClient(url, serviceKey);

async function main() {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });
  if (error) throw error;
  console.log(data.properties.action_link);
}
main().catch((e) => { console.error(e); process.exit(1); });
