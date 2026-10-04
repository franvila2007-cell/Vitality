// Dev-only: gives the local test client a few weeks of Bench Press / Incline
// history so the Workout Progress UI can be eyeballed with real-looking data.
//   npx tsx scripts/dev-seed-workouts.ts          # seed
//   npx tsx scripts/dev-seed-workouts.ts --clear  # remove all of the test client's workouts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/supabase/database.types';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing env'); process.exit(1); }
const sb = createClient<Database>(url, key);

const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function main() {
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
  const user = users?.users.find((u) => u.email === 'test-client@vitality.local');
  if (!user) throw new Error('test client not found');

  if (process.argv.includes('--clear')) {
    const { error } = await sb.from('workouts').delete().eq('user_id', user.id); // cascades to exercises + sets
    console.log(error ? error.message : 'cleared test-client workouts');
    return;
  }

  const { data: ws } = await sb.from('workouts').select('id').eq('user_id', user.id).eq('name', 'Push Day').limit(1);
  const workoutId = ws?.[0]?.id;
  if (!workoutId) throw new Error('create "Push Day" in the UI first');
  const { data: exs } = await sb.from('workout_exercises').select('id, name').eq('workout_id', workoutId);
  const bench = exs?.find((e) => e.name === 'Bench Press'), incline = exs?.find((e) => e.name === 'Incline Dumbbell Press');
  if (!bench) throw new Error('add Bench Press in the UI first');

  const rows: Database['public']['Tables']['workout_sets']['Insert'][] = [];
  // [daysAgo, [[kg, reps], ...]]
  const benchHist: [number, number[][]][] = [
    [-35, [[65, 8], [65, 7], [60, 9]]], [-28, [[67.5, 8], [67.5, 7], [65, 8]]], [-21, [[70, 8], [70, 6], [65, 9]]],
    [-14, [[70, 8], [70, 7], [65, 9]]], [-7, [[70, 8], [70, 7], [65, 9]]],
  ];
  for (const [off, sets] of benchHist) sets.forEach(([w, r], i) => rows.push({ user_id: user.id, exercise_id: bench.id, date: day(off), set_number: i + 1, weight_kg: w, reps: r }));
  if (incline) for (const [off, w, r] of [[-14, 24, 10], [-7, 24, 10], [-3, 26, 8]] as const) rows.push({ user_id: user.id, exercise_id: incline.id, date: day(off), set_number: 1, weight_kg: w, reps: r });
  const { error } = await sb.from('workout_sets').insert(rows);
  console.log(error ? error.message : `seeded ${rows.length} sets`);
}
main();
