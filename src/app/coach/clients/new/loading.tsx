import GenericCardsSkeleton from '@/components/skeletons/GenericCardsSkeleton';

// Overrides the client-list-shaped coach/loading.tsx fallback for this
// specific route so a fresh navigation here doesn't flash a mismatched
// shape.
export default function Loading() {
  return <GenericCardsSkeleton count={2} />;
}
