'use client';

import Link from 'next/link';
import { useState } from 'react';
import { variantUrl, type ShareLink } from '@/lib/shareLinks';

// One form / page the coach sends out: what it is, who gets it, where the
// answers land, and one-tap Copy / WhatsApp with a ready-to-paste message.
export default function ShareLinkCard({ link }: { link: ShareLink }) {
  const [variantIdx, setVariantIdx] = useState(0);
  const [copied, setCopied] = useState<'link' | 'message' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const variant = link.variants?.[variantIdx];
  const url = variantUrl(link, variant);
  const message = link.message.replace('{link}', url);

  async function copy(what: 'link' | 'message') {
    const text = what === 'link' ? url : message;
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers / blocked clipboard: fall back to a hidden textarea.
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) throw new Error('copy failed');
      } catch {
        setError('Couldn’t copy automatically — press and hold the link to copy it.');
        return;
      }
    }
    setCopied(what);
    setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000);
  }

  return (
    <article className="rounded-2xl border border-border bg-surface p-4" aria-label={link.title}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-light text-xl" aria-hidden>{link.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-base font-semibold leading-tight">{link.title}</h3>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-neutral-500">{link.kind}</span>
          </div>
          <dl className="mt-2 flex flex-col gap-1.5 text-sm">
            <div><dt className="inline text-2xs font-semibold uppercase tracking-wide text-neutral-400">Send to </dt><dd className="inline text-neutral-700">{link.forWho}</dd></div>
            <div><dt className="inline text-2xs font-semibold uppercase tracking-wide text-neutral-400">What it does </dt><dd className="inline text-neutral-700">{link.what}</dd></div>
          </dl>
        </div>
      </div>

      {link.variants && (
        <div className="mt-3">
          <p className="mb-1.5 text-2xs font-medium text-neutral-500">Where are you posting it?</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Where are you posting it?">
            {link.variants.map((v, i) => (
              <button key={v.label} type="button" onClick={() => setVariantIdx(i)} aria-pressed={i === variantIdx}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${i === variantIdx ? 'border-brand bg-brand text-white' : 'border-border text-neutral-600 hover:border-neutral-300'}`}>{v.label}</button>
            ))}
          </div>
          <p className="mt-1.5 text-2xs text-neutral-400">New leads from this link show in your CRM as <b className="text-neutral-600">{variant?.tag}</b>.</p>
        </div>
      )}

      <div className="mt-3 rounded-lg bg-neutral-50 px-3 py-2">
        <a href={url} target="_blank" rel="noreferrer" className="block break-all text-xs font-medium text-brand-dark hover:underline">{url}</a>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button type="button" onClick={() => copy('link')} className="rounded-xl bg-brand py-2.5 text-sm font-semibold text-white active:scale-[0.98]">{copied === 'link' ? 'Copied ✓' : 'Copy link'}</button>
        <button type="button" onClick={() => copy('message')} className="rounded-xl border border-brand/40 bg-brand-light py-2.5 text-sm font-semibold text-brand-dark active:scale-[0.98]">{copied === 'message' ? 'Copied ✓' : 'Copy message'}</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="rounded-xl border border-border py-2.5 text-center text-sm font-semibold text-neutral-700 hover:border-neutral-300">WhatsApp</a>
        <a href={url} target="_blank" rel="noreferrer" className="rounded-xl border border-border py-2.5 text-center text-sm font-semibold text-neutral-700 hover:border-neutral-300">Preview ↗</a>
      </div>
      {error && <p className="mt-2 text-xs text-status-bad-text" role="alert">{error}</p>}

      {(link.lands || link.note) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border pt-2.5 text-2xs text-neutral-400">
          {link.lands && <span>Answers go to: <Link href={link.lands.href} className="font-medium text-brand-dark hover:underline">{link.lands.label} →</Link></span>}
          {link.note && <span>{link.note}</span>}
        </div>
      )}
    </article>
  );
}
