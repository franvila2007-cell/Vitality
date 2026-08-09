// Dev-only helper: creates a throwaway client account with a known password
// (bypassing the email-invite flow) so the client experience can be verified
// end-to-end without needing inbox access. Not part of the app's runtime.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/supabase/database.types';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error('Missing env'); process.exit(1); }

const DEFAULT_HABITS = [
  { key: 'sunlight', label: 'Get 10+ minutes of sunlight', tag: 'Morning' },
  { key: 'caffeine', label: 'No caffeine after 2pm', tag: 'Sleep' },
  { key: 'protein', label: 'Hit your protein target', tag: 'Nutrition' },
  { key: 'treadmill', label: '10k steps / treadmill walk', tag: 'Movement' },
  { key: 'noSnacking', label: 'No mindless snacking', tag: 'Nutrition' },
  { key: 'seedOils', label: 'Avoid seed oils', tag: 'Nutrition' },
  { key: 'eatBeforeBed', label: 'Stop eating 2-3 hours before bed', tag: 'Sleep' },
];

const supabase = createClient<Database>(url, serviceKey);

async function main() {
  const email = 'test-client@vitality.local';
  const password = 'TestClient123!';

  const { data: created, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { role: 'client', full_name: 'Test Client' },
  });
  if (error) throw error;
  const id = created.user.id;
  const today = new Date().toISOString().slice(0, 10);

  await supabase.from('client_profiles').insert({
    user_id: id, start_date: today, start_weight: 85, current_weight: 85, goal_weight: 78,
    goal_type: 'lose', updated_by: 'coach',
  });
  await supabase.from('targets').insert({ user_id: id, calories: 2200, protein_g: 160, carbs_g: 220, fat_g: 70, updated_by: 'coach' });
  await supabase.from('habits').insert(DEFAULT_HABITS.map((h, i) => ({ user_id: id, ...h, sort_order: i })));

  console.log('Test client:', email, password, id);
}

main().catch((e) => { console.error(e); process.exit(1); });
