import ShareLinkRow from '@/components/coach/ShareLinkRow';
import { SHARE_LINKS } from '@/lib/shareLinks';

// Coach-only (role guard lives in coach/layout.tsx). The list is in lib/shareLinks.ts.
export const metadata = { title: 'Share links · Vitality' };

export default function LinksPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 page-fade-in">
      <h1 className="mb-4 text-h1 font-semibold">Share links</h1>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {SHARE_LINKS.map((l) => <ShareLinkRow key={l.id} link={l} />)}
      </ul>
    </div>
  );
}
