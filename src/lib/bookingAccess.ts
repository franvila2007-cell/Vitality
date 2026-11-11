import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { PACKAGES } from '@/lib/crm/constants';

// Who can book calls in the app: 1-1 coaching clients (a CRM package of
// 3 months / 6 months / 1 year) — not 8-Week Challenge or meal-plan clients —
// unless the coach has set it explicitly for that client (client_booking_access),
// which always wins.

const ONE_TO_ONE: string[] = PACKAGES.filter((p) => p.kind === 'coaching').map((p) => p.key);

export type BookingAccess = { allowed: boolean; source: 'coach' | 'package' | 'none'; package: string | null };

export async function bookingAccess(db: SupabaseClient<Database>, clientId: string): Promise<BookingAccess> {
  const [{ data: override }, { data: contact }] = await Promise.all([
    db.from('client_booking_access').select('allowed').eq('client_id', clientId).maybeSingle(),
    db.from('crm_contacts').select('package').eq('client_id', clientId).maybeSingle(),
  ]);
  const pkg = contact?.package ?? null;
  if (override) return { allowed: override.allowed, source: 'coach', package: pkg };
  const byPackage = pkg !== null && ONE_TO_ONE.includes(pkg);
  return { allowed: byPackage, source: byPackage ? 'package' : 'none', package: pkg };
}
