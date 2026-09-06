'use client';

import { useState } from 'react';

export default function ResendInviteButton({ userId }: { userId: string }) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function resend() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/coach/clients/${userId}/resend-invite`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not resend the invite.');
      setResult({ ok: true, message: 'Invite email sent.' });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Could not resend the invite.' });
    }
    setSending(false);
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <p className="text-sm font-medium mb-1">Resend invite</p>
      <p className="text-xs text-neutral-400 mb-3">Send this client a fresh sign-up email — useful if they never got it, lost it, or the link expired.</p>
      <button
        onClick={resend}
        disabled={sending}
        className="rounded-lg border border-border text-neutral-600 px-4 py-2 text-sm font-medium hover:border-brand hover:text-brand-dark transition-colors disabled:opacity-50"
      >
        {sending ? 'Sending…' : 'Resend invite'}
      </button>
      {result && (
        <p className={`text-xs mt-2 ${result.ok ? 'text-status-good-text' : 'text-red-600'}`}>{result.message}</p>
      )}
    </div>
  );
}
