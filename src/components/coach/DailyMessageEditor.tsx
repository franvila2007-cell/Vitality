'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { addDays, coachToday } from '@/lib/date';

type Msg = { date: string; body: string };

const MAX = 600;

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  if (date === addDays(today, -1)) return 'Yesterday';
  return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// A message for one specific day, shown at the top of the client's Today page
// on that day. Pick Today / Tomorrow / any date, write it, send. Sending
// again for the same day replaces it; Remove clears it.
export default function DailyMessageEditor({ userId, firstName, initial }: { userId: string; firstName: string; initial: Msg[] }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const today = coachToday();
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [date, setDate] = useState(today);
  const existing = messages.find((m) => m.date === date);
  const [text, setText] = useState(existing?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'sent' | 'removed' | 'error' | null>(null);

  function pick(next: string) {
    if (!next) return;
    setDate(next);
    setText(messages.find((m) => m.date === next)?.body ?? '');
    setStatus(null);
  }

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setStatus(null);
    const { error } = await supabase.from('coach_daily_messages').upsert(
      { user_id: userId, date, body, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,date' },
    );
    setBusy(false);
    if (error) { setStatus('error'); return; }
    setMessages((list) => [{ date, body }, ...list.filter((m) => m.date !== date)].sort((a, b) => b.date.localeCompare(a.date)));
    setStatus('sent');
    router.refresh();
  }

  async function remove() {
    if (!existing || busy) return;
    setBusy(true);
    const { error } = await supabase.from('coach_daily_messages').delete().eq('user_id', userId).eq('date', date);
    setBusy(false);
    if (error) { setStatus('error'); return; }
    setMessages((list) => list.filter((m) => m.date !== date));
    setText('');
    setStatus('removed');
    router.refresh();
  }

  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-xs font-medium transition-transform active:scale-95 ${active ? 'border-brand bg-brand text-white' : 'border-border text-neutral-500 hover:text-neutral-800'}`;
  const recent = messages.filter((m) => m.date !== date).slice(0, 5);

  return (
    <div className="bg-surface border border-brand/30 rounded-2xl p-4">
      <p className="text-sm font-medium">💬 Message for the day</p>
      <p className="text-xs text-neutral-400 mb-3">Shows at the top of {firstName}&rsquo;s Today page on the day you pick.</p>

      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
        <button onClick={() => pick(today)} className={chip(date === today)}>Today</button>
        <button onClick={() => pick(addDays(today, 1))} className={chip(date === addDays(today, 1))}>Tomorrow</button>
        <input
          type="date"
          value={date}
          onChange={(e) => pick(e.target.value)}
          className="rounded-lg border border-border bg-neutral-50 px-2 py-1 text-xs"
          aria-label="Pick a day"
        />
        {existing && <span className="text-3xs font-semibold uppercase tracking-wide rounded-full bg-status-good-bg text-status-good-text px-2 py-0.5">{date <= today ? 'Live' : 'Scheduled'}</span>}
      </div>

      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value.slice(0, MAX)); setStatus(null); }}
        rows={3}
        placeholder={`e.g. Great work yesterday, ${firstName} — today let's nail the protein target 💪`}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand transition-colors resize-none"
      />
      <div className="flex items-center gap-2 mt-2.5">
        <button onClick={send} disabled={busy || !text.trim() || text.trim() === existing?.body} className="rounded-lg bg-brand text-white px-4 py-2 text-sm font-medium disabled:opacity-40 transition-transform active:scale-95">
          {busy ? 'Sending…' : existing ? 'Update message' : `Send for ${dayLabel(date, today).toLowerCase()}`}
        </button>
        {existing && <button onClick={remove} disabled={busy} className="rounded-lg border border-border px-3 py-2 text-sm text-neutral-500 hover:text-status-bad-text disabled:opacity-40">Remove</button>}
        <span className="ml-auto text-2xs text-neutral-400 tabular-nums">{text.length}/{MAX}</span>
      </div>
      {status === 'sent' && <p className="text-2xs text-status-good-text mt-2">Sent ✓ — {firstName} will see it {date === today ? 'now' : `on ${dayLabel(date, today)}`}.</p>}
      {status === 'removed' && <p className="text-2xs text-neutral-500 mt-2">Removed.</p>}
      {status === 'error' && <p className="text-2xs text-status-bad-text mt-2">Couldn&rsquo;t save — try again.</p>}

      {recent.length > 0 && (
        <details className="mt-3 border-t border-border pt-2.5 group">
          <summary className="text-2xs font-medium text-neutral-400 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            Other messages ({recent.length}) <span className="inline-block transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {recent.map((m) => (
              <button key={m.date} onClick={() => pick(m.date)} className="text-left rounded-lg bg-neutral-50 px-3 py-2 hover:bg-neutral-100">
                <span className="block text-3xs uppercase tracking-wide text-neutral-400">{dayLabel(m.date, today)}</span>
                <span className="block text-sm text-neutral-700 truncate">{m.body}</span>
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
