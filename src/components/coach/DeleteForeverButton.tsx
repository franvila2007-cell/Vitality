'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteForeverButton({ userId, clientName }: { userId: string; clientName: string }) {
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
      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this client.');
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setConfirmText(''); setError(null); }}
        className="flex-shrink-0 text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
      >
        Delete forever
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-surface rounded-2xl p-4 w-full max-w-sm">
            <p className="text-sm font-medium mb-1">Permanently delete {clientName}?</p>
            <p className="text-xs text-neutral-400 mb-3">This erases their account, targets, meal history, habits, and progress for good — unlike removing them, there&rsquo;s no undo.</p>
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
                {deleting ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
