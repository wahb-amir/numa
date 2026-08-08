export default function Loading() {
  return (
    <div
      className="mx-auto max-w-5xl space-y-6 px-4 py-6 lg:px-8 lg:py-8"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <div className="h-40 animate-pulse rounded-card bg-surface-sunken" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-56 animate-pulse rounded-card bg-surface-sunken" />
        <div className="h-56 animate-pulse rounded-card bg-surface-sunken" />
      </div>
    </div>
  );
}
