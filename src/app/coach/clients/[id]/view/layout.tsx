import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import CoachViewTabs from '@/components/coach/CoachViewTabs';

// Shell for the coach's read-only mirror of a client's app: the back-link /
// "read-only" bar plus the same four tabs the client sees. Each tab below is
// a page under /view that renders that client's own data without any
// controls that could change it. Coach-role guard lives in coach/layout.tsx.
export default async function ClientAppPreviewLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('full_name, email, role').eq('id', id).single();
  if (!profile || profile.role !== 'client') notFound();
  const name = profile.full_name || profile.email;

  return (
    <>
      <div className="border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
          <Link href={`/coach/clients/${id}`} className="text-sm text-neutral-400 hover:text-neutral-700">&larr; {name}</Link>
          <span className="text-xs font-medium text-neutral-400 border border-border rounded-full px-2.5 py-1">👁 Read-only preview</span>
        </div>
      </div>
      <div className="pt-3">
        <CoachViewTabs clientId={id} />
      </div>
      {children}
    </>
  );
}
