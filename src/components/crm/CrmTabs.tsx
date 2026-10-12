'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/coach/crm', label: 'Overview' },
  { href: '/coach/crm/pipeline', label: 'Pipeline' },
  { href: '/coach/crm/contacts', label: 'Contacts' },
  { href: '/coach/crm/revenue', label: 'Revenue' },
];

export default function CrmTabs() {
  const pathname = usePathname();
  return (
    <nav className="grid grid-cols-4 gap-1 rounded-2xl bg-neutral-100 p-1">
      {TABS.map((t) => {
        const on = t.href === '/coach/crm' ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={`rounded-xl px-2 py-2 text-center text-sm font-medium ${on ? 'bg-surface text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-neutral-500 hover:text-neutral-800'}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
