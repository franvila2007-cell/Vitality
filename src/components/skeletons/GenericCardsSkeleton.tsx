import CardSkeleton from './CardSkeleton';

// Generic fallback for routes that don't warrant a bespoke skeleton shape
// (Nutrition/Progress/Milestones, and the coach sub-pages) — a handful of
// card-shaped blocks reads as "this page, still arriving" without needing
// to model each page's exact layout.
export default function GenericCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} className="h-28" />
      ))}
    </div>
  );
}
