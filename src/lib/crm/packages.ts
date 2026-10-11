import type { createClient } from '@/lib/supabase/server';
import type { CrmPackage } from '@/lib/supabase/database.types';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// What the package editor needs beyond the contact itself: the most recent
// price charged for each package (to pre-fill), and a sensible start date —
// the day their client account was created, else today.
export async function packageContext(supabase: ServerClient, clientId: string | null): Promise<{
  suggestedPrices: Partial<Record<CrmPackage, number>>;
  defaultStart: string;
}> {
  const [recentRes, profileRes] = await Promise.all([
    supabase.from('crm_contacts').select('package, package_price').not('package', 'is', null).not('package_price', 'is', null)
      .order('package_start', { ascending: false }).limit(50),
    clientId ? supabase.from('profiles').select('created_at').eq('id', clientId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const suggestedPrices: Partial<Record<CrmPackage, number>> = {};
  for (const r of recentRes.data || []) {
    if (r.package && r.package_price != null && suggestedPrices[r.package] == null) suggestedPrices[r.package] = Number(r.package_price);
  }
  const created = (profileRes.data as { created_at?: string } | null)?.created_at;
  return { suggestedPrices, defaultStart: (created ?? new Date().toISOString()).slice(0, 10) };
}
