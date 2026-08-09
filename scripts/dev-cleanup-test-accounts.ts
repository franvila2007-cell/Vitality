import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/supabase/database.types';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error('Missing env'); process.exit(1); }
const supabase = createClient<Database>(url, serviceKey);

async function main() {
  for (const email of ['test-client@vitality.local', 'test-coach@vitality.local']) {
    const { data } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
    if (data) {
      const { error } = await supabase.auth.admin.deleteUser(data.id);
      console.log(email, error ? `FAILED: ${error.message}` : 'deleted');
    } else {
      console.log(email, 'not found');
    }
  }
}
main();
