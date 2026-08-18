'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteClientButton({ userId, clientName }: { userId: string; clientName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/clients/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete this client.');
      router.push('/coach');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this client.');
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="bg-surface border border-red-200 rounded-2xl p-4">
        <p className="text-sm font-medium text-red-600 mb-1">Danger zone</p>
        <p className="text-xs text-neutral-400 mb-3">Permanently deletes {clientName}&rsquo;s account and all of their logged data. This can&rsquo;t be undone.</p>
        <button
          onClick={() => { setOpen(true); setConfirmText(''); setError(null); }}
          className="rounded-lg border border-red-200 text-red-600 px-4 py-2 text-sm font-medium hover:bg-red-50 transition-colors"
        >
          Remove client
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-surface rounded-2xl p-4 w-full max-w-sm">
            <p className="text-sm font-medium mb-1">Remove {clientName}?</p>
            <p className="text-xs text-neutral-400 mb-3">This permanently deletes their account, targets, meal history, habits, and progress. This can&rsquo;t be undone.</p>
            <label className="flex flex-col gap-1 mb-3">
              <span className="text-xs text-neutral-500">Type <span className="font-medium">{clientName}</span> to confirm</span>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand transition-colors"
              />
            </label>
            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)} disabled={deleting} className="flex-1 rounded-lg border border-border text-neutral-600 py-2 text-sm font-medium disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting || confirmText !== clientName}
                className="flex-1 rounded-lg bg-red-600 text-white py-2 text-sm font-medium disabled:opacity-40 transition-opacity"
              >
                {deleting ? 'Removing…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
