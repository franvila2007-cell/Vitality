import { addDays } from '@/lib/date';

const round2 = (n: number) => Math.round(n * 100) / 100;

function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}

// The payments still to come for a package, after what's already been paid.
// Paid in full → one payment for whatever's left. Monthly → the remaining
// months, splitting what's left evenly (the last one absorbs the cents).
export function buildSchedule(opts: {
  price: number;
  plan: 'full' | 'monthly';
  months: number | null;
  start: string;
  paidCount: number;
  paidSum: number;
}): { amount: number; due_on: string }[] {
  const remaining = round2(opts.price - opts.paidSum);
  if (remaining <= 0) return [];
  if (opts.plan === 'full' || !opts.months) return [{ amount: remaining, due_on: opts.start }];
  const left = Math.max(1, opts.months - opts.paidCount);
  const each = round2(remaining / left);
  return Array.from({ length: left }, (_, i) => ({
    amount: i === left - 1 ? round2(remaining - each * (left - 1)) : each,
    due_on: addMonths(opts.start, opts.paidCount + i),
  }));
}

export function isOverdue(p: { due_on: string; paid_on: string | null }, today: string): boolean {
  return !p.paid_on && p.due_on < today;
}

export function inNextDays(date: string, today: string, days: number): boolean {
  return date >= today && date <= addDays(today, days);
}
