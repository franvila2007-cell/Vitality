// Small display helpers for the CRM pages.

export function ago(iso: string, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  return mo < 12 ? `${mo}mo ago` : `${Math.round(mo / 12)}y ago`;
}

export function daysSince(iso: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 864e5));
}

export function euro(n: number): string {
  return `€${Math.round(n).toLocaleString('en-GB')}`;
}

export function shortDate(date: string): string {
  return new Date(date.length === 10 ? date + 'T00:00:00' : date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Due-date wording relative to `today` (YYYY-MM-DD).
export function dueLabel(due: string, today: string): { text: string; tone: 'overdue' | 'today' | 'soon' } {
  if (due < today) {
    const d = Math.round((new Date(today).getTime() - new Date(due).getTime()) / 864e5);
    return { text: d === 1 ? 'Yesterday' : `${d} days overdue`, tone: 'overdue' };
  }
  if (due === today) return { text: 'Today', tone: 'today' };
  const d = Math.round((new Date(due).getTime() - new Date(today).getTime()) / 864e5);
  return { text: d === 1 ? 'Tomorrow' : new Date(due + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), tone: 'soon' };
}
