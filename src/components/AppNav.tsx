'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import PrefetchOnIntentLink from '@/components/PrefetchOnIntentLink';

const TABS = [
  { href: '/', label: 'Today' },
  { href: '/nutrition', label: 'Nutrition' },
  { href: '/progress', label: 'Progress' },
  { href: '/milestones', label: 'Milestones' },
];

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="sticky top-0 z-10 bg-surface border-b border-border">
      <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center transition-opacity hover:opacity-70">
          <Image src="/vitality-logo.png" alt="Vitality" width={32} height={25} priority />
        </Link>
        <button onClick={signOut} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">
          Sign out
        </button>
      </div>
      {/* All 4 tabs are visible together on every page, and each destination
          is a fully dynamic, per-request Supabase-backed page — default
          prefetch would fire all 4 pages' worth of queries on every single
          page view, not just the one being shown, so this only prefetches
          the tab actually being touched/hovered. */}
      <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <PrefetchOnIntentLink
            key={t.href}
            href={t.href}
            className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border ${
              pathname === t.href ? 'bg-brand text-white border-brand' : 'border-border text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {t.label}
          </PrefetchOnIntentLink>
        ))}
      </div>
    </div>
  );
}
