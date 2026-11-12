import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runMicroBackfill } from '@/lib/microBackfill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Called every 10 minutes by the database (pg_cron → pg_net). Takes no input
// and returns only counts; it fills the quality score + micronutrients of
// foods that are still blank, and is throttled so extra calls do nothing.
export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, reason: 'not configured' });
  try {
    const r = await runMicroBackfill({ admin: createAdminClient(), apiKey });
    return NextResponse.json({ ok: true, checked: r.checked, filled: r.filled, skipped: r.skipped ?? null });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
