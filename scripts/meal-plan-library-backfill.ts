// Builds the Google Drive library document (meal_plans.library_html) for
// plans made before the library existed. The hourly Gamma task then uploads
// them to the coach's Drive folder like any new plan.
//   npx tsx scripts/meal-plan-library-backfill.ts
// Uses .env.local (Supabase service role). Doesn't call Claude or Gamma.
import { createClient } from '@supabase/supabase-js';
import type { Answers } from '../src/lib/assessment/questions';
import { buildLibraryHtml } from '../src/lib/mealPlan/libraryDoc';
import { ibfLocation } from '../src/lib/mealPlan/questions';
import type { PlanState } from '../src/lib/mealPlan/pipeline';
import type { Issue } from '../src/lib/mealPlan/validate';

process.loadEnvFile('.env.local');

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: plans, error } = await admin.from('meal_plans').select('id, request_id, state, issues, created_at').eq('status', 'generated').is('library_html', null);
  if (error) throw error;
  for (const p of plans ?? []) {
    const state = p.state as PlanState;
    const { data: request } = await admin.from('meal_plan_requests').select('full_name, answers').eq('id', p.request_id).single();
    if (!state.targets || !state.recipes || !request) { console.log('skip', p.id); continue; }
    const html = buildLibraryHtml({
      fullName: request.full_name,
      location: ibfLocation(request.answers as Answers),
      createdAt: new Date(p.created_at),
      targets: state.targets,
      exclusionNote: state.intake?.rules?.exclusionNote ?? '',
      recipes: state.recipes,
      photos: state.photos,
      issues: (p.issues ?? []) as Issue[],
    });
    const { error: upErr } = await admin.from('meal_plans').update({ library_html: html }).eq('id', p.id);
    if (upErr) throw upErr;
    console.log('built', request.full_name, html.length, 'chars');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
