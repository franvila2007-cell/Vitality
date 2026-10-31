'use client';

import { useState } from 'react';

// "Draft reply" on a check-in: asks Claude for a short WhatsApp reply in
// Fran's voice, shown in an editable box to copy. Never sent automatically.
export default function DraftReply({ checkinId, phone }: { checkinId: string; phone: string | null }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function draft() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch('/api/coach/challenge/draft-reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checkinId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      setText(data.text);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError('Copy failed. Select the text and copy it by hand.');
    }
  }

  const wa = phone ? `https://wa.me/${phone.replace(/\D/g, '')}` : null;

  return (
    <div className="mt-4">
      {!text ? (
        <button type="button" onClick={draft} disabled={busy} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60">
          {busy ? 'Drafting…' : 'Draft reply'}
        </button>
      ) : (
        <div>
          <textarea
            value={text} onChange={(e) => { setText(e.target.value); setCopied(false); }} rows={6}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-brand"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={copy} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:brightness-105">
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-neutral-50">Open WhatsApp</a>}
            <button type="button" onClick={draft} disabled={busy} className="rounded-lg px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800 disabled:opacity-60">
              {busy ? 'Drafting…' : 'Try another'}
            </button>
          </div>
          <p className="mt-1 text-2xs text-neutral-400">Nothing is sent. Edit, copy and paste it into WhatsApp yourself.</p>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-status-bad-text">{error}</p>}
    </div>
  );
}
