// Shaped like the real Today page — welcome hero, Vitto card, macro
// tracker — so the loading state reads as "this page, still arriving"
// instead of a generic blank spinner. This is the highest-value skeleton:
// it covers TodayClient's own client-side fetch, which is the slowest,
// most-visible load in the app (the server shell above it is near-instant).
export default function TodaySkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4 animate-pulse">
      <div className="rounded-card bg-neutral-100 h-56" />
      <div className="rounded-card bg-surface border border-border p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-neutral-100 flex-shrink-0" />
          <div className="flex flex-col gap-2">
            <div className="w-24 h-3 bg-neutral-100 rounded" />
            <div className="w-40 h-2.5 bg-neutral-100 rounded" />
          </div>
        </div>
        <div className="w-full h-16 bg-neutral-100 rounded-2xl" />
        <div className="w-full h-10 bg-neutral-100 rounded-full" />
      </div>
      <div className="rounded-card bg-surface border border-border p-4 flex items-center gap-5">
        <div className="w-24 h-24 rounded-full bg-neutral-100 flex-shrink-0" />
        <div className="flex-1 flex flex-col gap-3">
          <div className="w-full h-2 bg-neutral-100 rounded" />
          <div className="w-full h-2 bg-neutral-100 rounded" />
          <div className="w-full h-2 bg-neutral-100 rounded" />
        </div>
      </div>
      <div className="rounded-card bg-surface border border-border p-4 flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-11 bg-neutral-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
