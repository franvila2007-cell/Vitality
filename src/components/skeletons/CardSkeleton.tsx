// Shared pulsing placeholder block, sized to match --radius-card so it sits
// flush with the real cards it's standing in for.
export default function CardSkeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-neutral-100 rounded-card ${className}`} />;
}
