import GenericCardsSkeleton from '@/components/skeletons/GenericCardsSkeleton';

// Overrides the client-list-shaped coach/loading.tsx fallback — also covers
// the /view sub-route in absence of its own loading.tsx.
export default function Loading() {
  return <GenericCardsSkeleton count={4} />;
}
