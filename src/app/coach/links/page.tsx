import ShareLinkCard from '@/components/coach/ShareLinkCard';
import { SHARE_GROUPS } from '@/lib/shareLinks';

// Coach-only (role guard lives in coach/layout.tsx). The list itself is in
// lib/shareLinks.ts — add a form there and it appears here.
export const metadata = { title: 'Share links · Vitality' };

export default function LinksPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 page-fade-in">
      <div className="mb-5">
        <h1 className="text-h1 font-semibold">Share links</h1>
        <p className="text-sm text-neutral-500 mt-1">Every form and page you send out, and what each one is for. Tap <b>Copy message</b> and paste it into WhatsApp, Instagram or email.</p>
      </div>

      <nav aria-label="Jump to" className="mb-6 flex flex-wrap gap-1.5">
        {SHARE_GROUPS.map((g) => (
          <a key={g.id} href={`#${g.id}`} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-neutral-600 hover:border-neutral-300">{g.title}</a>
        ))}
      </nav>

      <div className="flex flex-col gap-8">
        {SHARE_GROUPS.map((g) => (
          <section key={g.id} id={g.id} aria-labelledby={`${g.id}-h`} className="scroll-mt-20">
            <h2 id={`${g.id}-h`} className="text-lg font-semibold leading-tight">{g.title}</h2>
            <p className="mb-3 text-sm text-neutral-500">{g.blurb}</p>
            <div className="flex flex-col gap-3">
              {g.links.map((l) => <ShareLinkCard key={l.id} link={l} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
