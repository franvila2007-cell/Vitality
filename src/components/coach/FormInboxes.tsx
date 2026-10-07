import Image from 'next/image';
import Link from 'next/link';
import { INBOXES, type InboxCounts, type InboxKey } from '@/lib/coach/formInboxes';

// Per-inbox look, so the three are told apart at a glance everywhere they
// appear: Assessments = clipboard, IronBodyFit = their shield + red,
// V Plans = the Vitality V.
const LOOK: Record<InboxKey, { stripe: string; badge: string; freshLabel: string }> = {
  assessments: { stripe: 'bg-brand', badge: 'bg-brand text-white', freshLabel: 'this week' },
  ironbodyfit: { stripe: 'collab-gradient', badge: 'bg-ibf-red text-white', freshLabel: 'new' },
  vitality: { stripe: 'assess-gradient', badge: 'bg-brand text-white', freshLabel: 'new' },
};

function InboxMark({ inbox, size }: { inbox: InboxKey; size: number }) {
  if (inbox === 'ironbodyfit') return <Image src="/ironbodyfit-logo.png" alt="" width={size} height={Math.round(size * 0.9)} />;
  if (inbox === 'vitality') return <Image src="/vitality-logo.png" alt="" width={size} height={Math.round(size * 0.8)} />;
  return (
    <span className="flex items-center justify-center rounded-lg bg-brand-light text-brand-dark" style={{ width: size, height: size }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9zM9 12h6M9 16h4" />
      </svg>
    </span>
  );
}

// Coach home: the three form inboxes side by side.
export function InboxCards({ counts }: { counts: InboxCounts }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
      {INBOXES.map((box) => {
        const { total, fresh } = counts[box.key];
        const look = LOOK[box.key];
        return (
          <Link
            key={box.key}
            href={box.href}
            className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface p-3 sm:p-4 hover:border-neutral-300 hover:shadow-[0_4px_16px_-8px_rgba(0,0,0,0.15)]"
          >
            <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${look.stripe}`} />
            <div className="flex items-start justify-between gap-1">
              <span className="flex h-7 items-center"><InboxMark inbox={box.key} size={28} /></span>
              {fresh > 0 && (
                <span className={`min-w-5 rounded-full px-1.5 text-center text-3xs font-semibold leading-5 ${look.badge}`}>{fresh}</span>
              )}
            </div>
            <div className="mt-3 text-sm font-semibold leading-tight">{box.title}</div>
            <div className="mt-0.5 text-2xs text-neutral-400 leading-snug">{box.subtitle}</div>
            <div className="mt-auto pt-3 flex items-baseline gap-1">
              <span className="text-xl font-semibold tabular-nums">{total}</span>
              <span className="text-2xs text-neutral-400">total</span>
            </div>
            <div className={`text-2xs ${fresh > 0 ? 'font-medium text-neutral-700' : 'text-neutral-400'}`}>
              {fresh} {look.freshLabel}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// Top of each inbox page: switch between the three without going home.
export function InboxTabs({ active, counts }: { active: InboxKey; counts: InboxCounts }) {
  const current = INBOXES.find((b) => b.key === active)!;
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <Link href="/coach" className="text-sm text-neutral-500 hover:text-neutral-800">← Clients</Link>
        <span className="text-2xs text-neutral-400">
          Form link: <span className="font-mono text-neutral-600">{current.formPath}</span>
        </span>
      </div>
      <nav className="grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1">
        {INBOXES.map((box) => {
          const on = box.key === active;
          const { fresh } = counts[box.key];
          return (
            <Link
              key={box.key}
              href={box.href}
              aria-current={on ? 'page' : undefined}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs sm:text-sm font-medium ${
                on ? 'bg-surface text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <span className="hidden sm:inline-flex"><InboxMark inbox={box.key} size={18} /></span>
              <span className="truncate">{box.title}</span>
              {fresh > 0 && box.key !== 'assessments' && (
                <span className={`min-w-4 rounded-full px-1 text-center text-3xs font-semibold leading-4 ${LOOK[box.key].badge}`}>{fresh}</span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
