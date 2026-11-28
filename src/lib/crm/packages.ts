import type { createClient } from '@/lib/supabase/server';
import type { CrmPackage } from '@/lib/supabase/database.types';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// What the package editor needs beyond the contact itself: the standard price of
// each package (the one the coach set, else the price used most often so far — so a
// one-off custom price never becomes the next client's starting price), and a
// sensible start date — the day their client account was created, else today.
export async function packageContext(supabase: ServerClient, clientId: string | null): Promise<{
  suggestedPrices: Partial<Record<CrmPackage, number>>;
  defaultStart: string;
}> {
  const [recentRes, profileRes, settingsRes] = await Promise.all([
    supabase.from('crm_contacts').select('package, package_price, package_list_price').not('package', 'is', null).not('package_price', 'is', null).eq('is_free', false).neq('brand', 'ironbodyfit')
      .order('package_start', { ascending: false }).limit(50),
    clientId ? supabase.from('profiles').select('created_at').eq('id', clientId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('coach_settings').select('package_prices').eq('id', 1).maybeSingle(),
  ]);
  // Most common price per package among recent clients (ties go to the most recent). IronBodyFit's €10 meal plan is excluded above.
  const counts: Partial<Record<CrmPackage, Map<number, number>>> = {};
  for (const r of recentRes.data || []) {
    if (!r.package || r.package === '8_week_challenge' || r.package_price == null) continue;
    const v = Number(r.package_list_price ?? r.package_price); // the usual price, not a one-off discounted one
    const m = (counts[r.package] ??= new Map());
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  const suggestedPrices: Partial<Record<CrmPackage, number>> = {};
  for (const [pkg, m] of Object.entries(counts) as [CrmPackage, Map<number, number>][]) {
    let best = -1;
    for (const [v, n] of m) if (n > best) { best = n; suggestedPrices[pkg] = v; } // Map keeps insertion (newest-first) order, so ties keep the newest
  }
  // The coach's own standard prices win.
  const set = (settingsRes.data as { package_prices?: Record<string, number> } | null)?.package_prices ?? {};
  for (const [k, v] of Object.entries(set)) if (Number.isFinite(Number(v)) && Number(v) >= 0) suggestedPrices[k as CrmPackage] = Number(v);
  const created = (profileRes.data as { created_at?: string } | null)?.created_at;
  return { suggestedPrices, defaultStart: (created ?? new Date().toISOString()).slice(0, 10) };
}
