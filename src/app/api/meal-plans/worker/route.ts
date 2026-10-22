import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runWorker } from '@/lib/mealPlan/worker';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Moves queued meal-plan builds forward and emails the coach about finished
// ones. Deliberately takes no input and returns only counts: anyone calling
// it can at most make queued work happen sooner — each build has a lease and
// capped retries, and nothing about any client is returned. Called by the
// form route after a submission, by itself to continue long builds, and by
// the hourly Gamma task as a safety net.
export async function POST(req: Request) {
  const started = Date.now();
  const result = await runWorker(createAdminClient(), new URL(req.url).origin, started);
  return NextResponse.json(result);
}

export const GET = POST;
