import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PHOTO_BUCKET } from '@/lib/challenge/checkin';
import { describeCheckin } from '@/lib/challenge/describe';
import { loadChallengeMembers } from '@/lib/challenge/members';
import { waLink } from '@/lib/crm/constants';
import WeekChart from '@/components/challenge/WeekChart';
import DraftReply from '@/components/challenge/DraftReply';

// Temporary (8-Week Challenge): one member — charts across weeks, every
// check-in's answers and photos, and a "Draft reply" per check-in.
// Coach-only via coach/layout.tsx; photos are shown through short-lived
// signed URLs from the private bucket.
export default async function ChallengeMemberPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  if (typeof email !== 'string') notFound();
  const supabase = await createClient();
  const { members } = await loadChallengeMembers(supabase);
  const m = members.find((x) => x.email === email.toLowerCase());
  if (!m) notFound();

  const paths = m.checkins.flatMap((c) => c.photo_paths);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await createAdminClient().storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }

  // One value per week for the charts (the latest check-in for that week).
  const latestPerWeek = [...new Map(m.checkins.map((c) => [c.week_number, c])).values()].sort((a, b) => a.week_number - b.week_number);
  const series = (key: 'weight_kg' | 'waist_cm' | 'feeling') =>
    latestPerWeek.filter((c) => c[key] != null).map((c) => ({ week: c.week_number, value: Number(c[key]) }));
  const newestFirst = [...m.checkins].reverse();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 page-fade-in">
      <Link href="/coach/challenge/check-ins" className="text-sm text-neutral-500 hover:text-neutral-800">← This week&apos;s check-ins</Link>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <h1 className="text-h1 font-semibold">{m.name}</h1>
        {m.needsReview && <span className="rounded-full bg-status-warn-bg px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-status-warn-text">Needs review: no intake</span>}
      </div>
      <p className="text-sm text-neutral-500 mt-1">
        {m.goal ?? 'No goal yet'} · Week {m.week} · Started {new Date(`${m.startDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        {m.startWeight != null && <> at {m.startWeight} kg</>}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {m.phone && <a href={waLink(m.phone)} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-dark hover:underline">WhatsApp {m.phone}</a>}
        <a href={`mailto:${m.email}`} className="text-brand-dark hover:underline">{m.email}</a>
        {m.intakeId && <Link href={`/coach/challenge/${m.intakeId}`} className="text-brand-dark hover:underline">Intake →</Link>}
        {m.crmContactId && <Link href={`/coach/crm/contacts/${m.crmContactId}`} className="text-brand-dark hover:underline">CRM contact →</Link>}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <WeekChart title="Weight" unit="kg" points={series('weight_kg')} />
        <WeekChart title="Waist" unit="cm" points={series('waist_cm')} />
        <WeekChart title="Feeling" unit="/10" points={series('feeling')} fixed={[1, 10]} />
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold">Check-ins ({m.checkins.length})</h2>
      {newestFirst.length === 0 && <p className="text-sm text-neutral-400">No check-ins yet.</p>}
      <div className="flex flex-col gap-4">
        {newestFirst.map((c) => (
          <article key={c.id} className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Week {c.week_number}</h3>
              <span className="text-2xs text-neutral-400">
                {new Date(c.created_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Malta' })}
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-4">
              {describeCheckin(c).map((s) => (
                <section key={s.section}>
                  <p className="text-3xs font-semibold uppercase tracking-wider text-brand mb-1.5">{s.section}</p>
                  <dl className="flex flex-col gap-2">
                    {s.items.map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-2xs text-neutral-500">{k}</dt>
                        <dd className="text-sm whitespace-pre-wrap">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
            {c.photo_paths.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {c.photo_paths.map((p) => {
                  const url = signed.get(p);
                  const slot = p.split('/')[1]?.split('.')[0] ?? 'photo';
                  return url ? (
                    <a key={p} href={url} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`${slot} photo, week ${c.week_number}`} className="aspect-[3/4] w-full rounded-lg object-cover border border-border" />
                      <span className="mt-1 block text-center text-2xs capitalize text-neutral-500">{slot}</span>
                    </a>
                  ) : (
                    <div key={p} className="aspect-[3/4] rounded-lg border border-dashed border-border flex items-center justify-center text-2xs text-neutral-400">{slot}: unavailable</div>
                  );
                })}
              </div>
            )}
            <DraftReply checkinId={c.id} phone={m.phone} />
          </article>
        ))}
      </div>
    </div>
  );
}
