// Shaped like the real coach client-list rows — the coach dashboard runs a
// genuinely slow per-client Promise.all (food history, habit history,
// checkpoints, weekly rank window), so this is worth a real skeleton rather
// than a spinner.
export default function CoachClientListSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="w-32 h-6 bg-neutral-100 rounded" />
        <div className="w-28 h-9 bg-neutral-100 rounded-lg" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-neutral-100 flex-shrink-0" />
              <div className="flex-1 flex flex-col gap-1.5">
                <div className="w-32 h-3 bg-neutral-100 rounded" />
                <div className="w-24 h-2.5 bg-neutral-100 rounded" />
              </div>
              <div className="w-20 h-3 bg-neutral-100 rounded flex-shrink-0" />
            </div>
            <div className="pl-[22px]">
              <div className="w-24 h-5 bg-neutral-100 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
