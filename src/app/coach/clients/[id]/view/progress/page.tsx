import { createClient } from '@/lib/supabase/server';
import ProgressClient from '@/components/ProgressClient';
import MilestoneProtocol from '@/components/MilestoneProtocol';

export default async function ClientProgressPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // Server component: "now" per request is exactly what we want here.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const { data: cp } = await supabase.from('client_profiles').select('*').eq('user_id', id).maybeSingle();
  return (
    <>
      <ProgressClient userId={id} readOnly />
      {cp && <div className="max-w-2xl mx-auto px-4 pb-6"><MilestoneProtocol cp={cp} nowMs={nowMs} /></div>}
    </>
  );
}
