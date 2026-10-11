import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CrmStage } from '@/lib/supabase/database.types';
import { STAGES, STAGE_META, sourceLabel } from '@/lib/crm/constants';

// CSV export of CRM contacts (same filters as the contacts list). Coach-only:
// /coach/* is gated by the proxy, and this checks the role again since a
// route handler doesn't go through coach/layout.tsx.
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'coach') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  let query = supabase.from('crm_contacts').select('*').order('created_at', { ascending: true }).limit(10000);
  const stage = sp.get('stage') || '';
  if (STAGES.some((s) => s.key === stage)) query = query.eq('stage', stage as CrmStage);
  if (sp.get('source')) query = query.eq('source', sp.get('source')!);
  if (sp.get('tag')) query = query.contains('tags', [sp.get('tag')!.toLowerCase()]);
  const term = (sp.get('q') || '').replace(/[%,()]/g, ' ').trim();
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    // Quote everything; neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const header = ['Name', 'Email', 'Phone', 'Stage', 'Source', 'Value €/month', 'Tags', 'Lost reason', 'Notes', 'Added', 'Last activity'];
  const lines = (data || []).map((c) => [
    c.full_name, c.email, c.phone, STAGE_META[c.stage]?.label ?? c.stage, sourceLabel(c.source), c.value_eur,
    c.tags.join(', '), c.lost_reason, c.notes, c.created_at.slice(0, 10), c.last_activity_at.slice(0, 10),
  ].map(cell).join(','));
  const csv = '﻿' + [header.map(cell).join(','), ...lines].join('\r\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vitality-crm-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
