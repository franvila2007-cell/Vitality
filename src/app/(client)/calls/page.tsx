import { redirect } from 'next/navigation';
import CallsClient from '@/components/CallsClient';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bookingAccess } from '@/lib/bookingAccess';

export const metadata = { title: 'Calls · Vitality' };

// Role guard and nav live in (client)/layout.tsx. Booking is only for 1-1 coaching clients.
export default async function CallsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await bookingAccess(createAdminClient(), user.id)).allowed) redirect('/');
  return <CallsClient />;
}
