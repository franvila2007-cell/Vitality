'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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
        <div className="flex items-center gap-2">
          <Image src="/vitality-logo.png" alt="" width={28} height={22} priority />
          <span className="font-medium text-lg text-brand-dark">Vitality</span>
        </div>
        <button onClick={signOut} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">
          Sign out
        </button>
      </div>
      <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border ${
              pathname === t.href ? 'bg-brand text-white border-brand' : 'border-border text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
