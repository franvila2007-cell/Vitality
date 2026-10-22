import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { advancePlan, startPlan } from '@/lib/mealPlan/pipeline';

export const runtime = 'nodejs';
// One stage (one or two Claude calls) per request, well inside this.
export const maxDuration = 300;

// Coach-only: builds (or rebuilds) the automated meal plan for a request,
// one stage per call. The test page keeps calling this until the plan is
// finished. Body: { restart?: boolean } — restart starts a fresh version.
export async function POST(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'coach') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { restart } = (await req.json().catch(() => ({}))) as { restart?: boolean };
  const admin = createAdminClient();
  const { data: request } = await admin.from('meal_plan_requests').select('id').eq('id', requestId).maybeSingle();
  if (!request) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: latest } = await admin.from('meal_plans').select('id, status').eq('request_id', requestId).order('version', { ascending: false }).limit(1).maybeSingle();
  const planId = !latest || restart ? await startPlan(admin, requestId) : latest.id;
  const result = latest && !restart && latest.status !== 'building' ? { status: latest.status, stage: 'done' } : await advancePlan(admin, planId);
  return NextResponse.json({ planId, ...result });
}
