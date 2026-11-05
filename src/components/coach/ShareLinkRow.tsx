'use client';

import { useState } from 'react';
import type { ShareLink } from '@/lib/shareLinks';

// One row: what it is, what it's for, the link, and a Copy button.
export default function ShareLinkRow({ link }: { link: ShareLink }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(link.url);
    } catch {
      // Older browsers / blocked clipboard: fall back to a hidden textarea.
      try {
        const ta = document.createElement('textarea');
        ta.value = link.url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) throw new Error('copy failed');
      } catch {
        setFailed(true);
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="text-xl" aria-hidden>{link.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{link.title} <span className="font-normal text-neutral-400">· {link.use}</span></p>
        <a href={link.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-brand-dark hover:underline">{link.url.replace('https://', '')}</a>
        {failed && <p className="text-2xs text-status-bad-text" role="alert">Couldn’t copy — press and hold the link instead.</p>}
      </div>
      <button type="button" onClick={copy} className={`w-20 flex-shrink-0 rounded-lg py-2 text-xs font-semibold active:scale-[0.97] ${copied ? 'bg-status-good-bg text-status-good-text' : 'bg-brand text-white'}`}>{copied ? 'Copied ✓' : 'Copy'}</button>
    </li>
  );
}
