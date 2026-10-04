'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Same four tabs as the client's own nav, pointed at the coach's read-only
// mirror of each one.
export default function CoachViewTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const base = `/coach/clients/${clientId}/view`;
  const tabs = [
    { href: base, label: 'Today' },
    { href: `${base}/nutrition`, label: 'Nutrition' },
    { href: `${base}/progress`, label: 'Progress' },
    { href: `${base}/milestones`, label: 'Milestones' },
  ];
  return (
    <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto">
      {tabs.map((t) => (
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
  );
}
