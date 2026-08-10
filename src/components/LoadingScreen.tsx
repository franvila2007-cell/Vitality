export default function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 flex flex-col items-center gap-3 text-sm text-neutral-400">
      <span className="w-6 h-6 rounded-full border-2 border-neutral-200 border-t-brand animate-spin" />
      {label}
    </div>
  );
}
