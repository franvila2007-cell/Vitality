import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import CoachNav from '@/components/coach/CoachNav';

// Persistent shell for every /coach/* route — previously each page (list,
// add-client, client detail, client preview) rendered its own near-identical
// header markup and repeated the same coach-role guard (or, for the
// client-component add-client form, had no guard of its own at all beyond
// middleware). One shell + one guard here; additive to each page's own
// contextual bar (back-link, "Read-only preview" badge, etc.) rather than
// trying to unify two structurally different header styles into one.
export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'coach') redirect('/');
  // Open CRM follow-ups due today or overdue, badged on the CRM switch.
  // UTC date: a follow-up due "today" may light up a few hours early/late.
  const { count: followUpsDue } = await supabase.from('crm_tasks').select('id', { count: 'exact', head: true })
    .is('done_at', null).lte('due_on', new Date().toISOString().slice(0, 10));

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-10 bg-surface border-b border-border">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/coach" className="flex items-center gap-2 transition-opacity hover:opacity-70">
            <Image src="/vitality-logo.png" alt="Vitality" width={32} height={25} priority />
            <span className="hidden sm:inline text-xs font-medium text-neutral-400 border border-border rounded-full px-2 py-0.5">Coach</span>
          </Link>
          <div className="flex items-center gap-3">
            <CoachNav followUpsDue={followUpsDue ?? 0} />
            <SignOutButton />
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function SignOutButton() {
  return (
    <form action="/api/auth/signout" method="post">
      <button className="text-xs text-neutral-400 hover:text-neutral-600">Sign out</button>
    </form>
  );
}
