'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ACADEMY_MILESTONES, ACADEMY_COURSE_COUNT } from '@/lib/academy';

// Vitality Academy in the Milestones tab: every course open, grouped by
// milestone, with a tick the client sets when they've finished one.
export default function AcademyCourses({ userId, initialDone }: { userId: string; initialDone: number[] }) {
  const [done, setDone] = useState(() => new Set(initialDone));
  const [busy, setBusy] = useState<number | null>(null);

  async function toggle(n: number) {
    const supabase = createClient();
    const wasDone = done.has(n);
    setBusy(n);
    const next = new Set(done);
    if (wasDone) next.delete(n); else next.add(n);
    setDone(next);
    const { error } = wasDone
      ? await supabase.from('academy_progress').delete().eq('client_id', userId).eq('course_number', n)
      : await supabase.from('academy_progress').insert({ client_id: userId, course_number: n });
    if (error) setDone(done); // put it back if it didn't save
    setBusy(null);
  }

  const pct = Math.round((done.size / ACADEMY_COURSE_COUNT) * 100);

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <p className="text-3xs uppercase tracking-wide text-neutral-400 mb-1">Vitality Academy</p>
      <p className="text-sm font-medium mb-1">{done.size} of {ACADEMY_COURSE_COUNT} courses done</p>
      <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden mb-4">
        <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-col gap-5">
        {ACADEMY_MILESTONES.map((m, i) => {
          const finished = m.courses.filter((c) => done.has(c.n)).length;
          return (
            <div key={m.title}>
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-xs font-semibold">Milestone {i + 1} · {m.title}</p>
                <p className="text-2xs text-neutral-400">{finished}/{m.courses.length}</p>
              </div>
              <div className="flex flex-col gap-2">
                {m.courses.map((c) => {
                  const isDone = done.has(c.n);
                  return (
                    <div key={c.n} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${isDone ? 'border-brand bg-brand-light' : 'border-border'}`}>
                      <button
                        type="button"
                        onClick={() => toggle(c.n)}
                        disabled={busy === c.n}
                        aria-label={isDone ? `Mark course ${c.n} as not done` : `Mark course ${c.n} as done`}
                        className={`h-6 w-6 shrink-0 rounded-full border text-xs flex items-center justify-center transition-colors ${isDone ? 'bg-brand border-brand text-white' : 'border-neutral-300 text-transparent hover:border-brand'}`}
                      >✓</button>
                      <a href={`/api/academy/${c.n}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 group">
                        <span className="block text-2xs text-neutral-400">Course {String(c.n).padStart(2, '0')}</span>
                        <span className={`block text-sm leading-snug group-hover:underline ${isDone ? 'text-brand-dark' : ''}`}>{c.title}</span>
                      </a>
                      <a href={`/api/academy/${c.n}`} target="_blank" rel="noreferrer" className="text-2xs font-medium text-brand-dark shrink-0">Open →</a>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
