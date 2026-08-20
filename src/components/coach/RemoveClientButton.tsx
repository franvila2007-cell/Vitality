'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RemoveClientButton({ userId, clientName }: { userId: string; clientName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmRemove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/clients/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not remove this client.');
      router.push('/coach');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this client.');
      setRemoving(false);
    }
  }

  return (
    <>
      <div className="bg-surface border border-red-200 rounded-2xl p-4">
        <p className="text-sm font-medium text-red-600 mb-1">Remove client</p>
        <p className="text-xs text-neutral-400 mb-3">Hides {clientName} from your client list. Nothing is deleted — you can add them back anytime from Removed clients.</p>
        <button
          onClick={() => { setOpen(true); setError(null); }}
          className="rounded-lg border border-red-200 text-red-600 px-4 py-2 text-sm font-medium hover:bg-red-50 transition-colors"
        >
          Remove client
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-surface rounded-2xl p-4 w-full max-w-sm">
            <p className="text-sm font-medium mb-1">Remove {clientName}?</p>
            <p className="text-xs text-neutral-400 mb-3">They&rsquo;ll disappear from your client list, but their targets, meal history, habits, and progress are all kept — restore them anytime from Removed clients on the client list page.</p>
            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)} disabled={removing} className="flex-1 rounded-lg border border-border text-neutral-600 py-2 text-sm font-medium disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                disabled={removing}
                className="flex-1 rounded-lg bg-red-600 text-white py-2 text-sm font-medium disabled:opacity-50 transition-opacity"
              >
                {removing ? 'Removing…' : 'Remove client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
