import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getInboxCounts } from '@/lib/coach/formInboxes';
import { InboxTabs } from '@/components/coach/FormInboxes';
import ChallengeTabs from '@/components/challenge/ChallengeTabs';
import { checkedInThisWeek, loadChallengeMembers, memberHref, type ChallengeMember } from '@/lib/challenge/members';

// Temporary (8-Week Challenge): who has checked in for their current week and
// who hasn't, plus members flagged for review (checked in with no intake on
// file). Coach-only via coach/layout.tsx and RLS.
export default async function ChallengeCheckinsPage() {
  const supabase = await createClient();
  const [{ members, error }, counts] = await Promise.all([loadChallengeMembers(supabase), getInboxCounts(supabase)]);
  const review = members.filter((m) => m.needsReview);
  const missing = members.filter((m) => !checkedInThisWeek(m));
  const done = members.filter((m) => checkedInThisWeek(m));

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 page-fade-in">
      <InboxTabs active="challenge" counts={counts} />
      <ChallengeTabs active="checkins" />
      <h1 className="text-h1 font-semibold">This week&apos;s check-ins</h1>
      <p className="text-sm text-neutral-500 mt-1 mb-5">
        {done.length} of {members.length} checked in · Check-in link: <span className="font-mono text-neutral-600">/challenge/check-in</span>
      </p>
      {error && <p className="text-sm text-status-bad-text mb-4">Couldn&apos;t load everything: {error}</p>}

      {review.length > 0 && (
        <Section title={`Needs review (${review.length})`} note="Checked in without an intake on file. Check who they are and that they've paid.">
          {review.map((m) => <Row key={m.email} m={m} />)}
        </Section>
      )}
      <Section title={`Missing ❌ (${missing.length})`}>
        {missing.length ? missing.map((m) => <Row key={m.email} m={m} />) : <Empty text="Everyone has checked in this week." />}
      </Section>
      <Section title={`Checked in ✅ (${done.length})`}>
        {done.length ? done.map((m) => <Row key={m.email} m={m} />) : <Empty text="No check-ins yet this week." />}
      </Section>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold mb-1">{title}</h2>
      {note && <p className="text-2xs text-neutral-500 mb-2">{note}</p>}
      <div className="flex flex-col gap-2 mt-2">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-neutral-400">{text}</p>;
}

function Row({ m }: { m: ChallengeMember }) {
  const latest = checkedInThisWeek(m);
  return (
    <Link href={memberHref(m)} className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3 hover:bg-neutral-50">
      <span className="text-base shrink-0" aria-label={latest ? 'Checked in' : 'Missing'}>{latest ? '✅' : '❌'}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{m.name}</span>
          {m.needsReview && <span className="shrink-0 rounded-full bg-status-warn-bg px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-status-warn-text">Review</span>}
        </div>
        <div className="text-2xs text-neutral-400 truncate">
          Week {m.week} · {m.goal ?? 'No goal yet'} · {m.checkins.length} check-in{m.checkins.length === 1 ? '' : 's'} total
        </div>
      </div>
      {latest && (
        <div className="text-2xs text-neutral-400 shrink-0">
          {new Date(latest.created_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
        </div>
      )}
      <span className="text-neutral-300">›</span>
    </Link>
  );
}
