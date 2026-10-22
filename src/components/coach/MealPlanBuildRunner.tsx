'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const STAGE_LABEL: Record<string, string> = {
  intake: 'Reading their answers and working out calories…',
  recipes: 'Writing recipes (this is the longest step, 1–3 minutes)…',
  repair: 'Checking every recipe hits its calories…',
  photos: 'Finding and checking a stock photo for every recipe…',
  checks: 'Running the final checks…',
};

// Drives a meal-plan build from the coach test page: calls the build route
// one stage at a time until the plan is finished, then refreshes the page
// to show it. `autoStart` resumes a build that is already under way.
export default function MealPlanBuildRunner({ requestId, autoStart, hasPlan }: { requestId: string; autoStart: boolean; hasPlan: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string>('intake');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function run(restart: boolean) {
    setRunning(true);
    setError(null);
    let first = true;
    try {
      for (let i = 0; i < 12; i++) {
        const res = await fetch(`/api/coach/meal-plans/${requestId}/build`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restart: restart && first }),
        });
        first = false;
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        setStage(body.stage);
        if (body.status !== 'building') break;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
    setRunning(false);
  }

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void run(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  if (running) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
        <span className="inline-block animate-pulse">⏳</span> {STAGE_LABEL[stage] ?? 'Working…'}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <button onClick={() => run(hasPlan)} className="self-start rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
        {hasPlan ? 'Build a new version' : 'Build test plan'}
      </button>
      {error && <p className="text-2xs text-status-bad-text">{error}</p>}
    </div>
  );
}
