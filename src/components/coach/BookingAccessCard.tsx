'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// "Can this client book calls in the app?" — automatic for 1-1 coaching clients,
// and the coach can switch it on or off for anyone.
export default function BookingAccessCard({ clientId, initial }: {
  clientId: string;
  initial: { allowed: boolean; source: 'coach' | 'package' | 'none' };
}) {
  const [supabase] = useState(() => createClient());
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(allowed: boolean) {
    setBusy(true); setError(null);
    const { error: err } = await supabase.from('client_booking_access').upsert({ client_id: clientId, allowed, updated_at: new Date().toISOString() });
    if (err) setError('Couldn’t save — try again.');
    else setState({ allowed, source: 'coach' });
    setBusy(false);
  }

  async function reset() {
    setBusy(true); setError(null);
    const { error: err } = await supabase.from('client_booking_access').delete().eq('client_id', clientId);
    if (err) { setError('Couldn’t save — try again.'); setBusy(false); return; }
    // Back to automatic: allowed only if they're on a 1-1 package, which a reload re-evaluates.
    window.location.reload();
  }

  const note = state.source === 'coach'
    ? 'You set this yourself.'
    : state.source === 'package' ? 'On automatically because they’re a 1-1 coaching client.' : 'Off automatically — they’re not on a 1-1 coaching package.';

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-medium">📞 Can book calls in the app</span>
          <span className="block text-2xs text-neutral-400">{note}</span>
        </span>
        <input type="checkbox" checked={state.allowed} disabled={busy} onChange={(e) => set(e.target.checked)} className="h-5 w-5 flex-shrink-0 accent-[var(--brand)] disabled:opacity-50" aria-label="Can book calls in the app" />
      </label>
      {state.source === 'coach' && <button type="button" onClick={reset} disabled={busy} className="mt-1.5 text-2xs text-neutral-400 underline disabled:opacity-50">Go back to automatic</button>}
      {error && <p className="mt-1.5 text-xs text-status-bad-text" role="alert">{error}</p>}
    </div>
  );
}
