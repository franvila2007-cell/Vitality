import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const email = process.argv[2];

async function main() {
  const supabase = createClient(url, serviceKey);
  const { data } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
  if (!data) { console.log('not found'); return; }
  const { error } = await supabase.auth.admin.deleteUser(data.id);
  console.log(error ? `FAILED: ${error.message}` : 'deleted');
}
main();
