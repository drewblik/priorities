/** Shared loading skeleton for the heavier server pages (M20 polish).
 *  Pure CSS pulse; no client JS. Rendered by route-level loading.tsx
 *  files while the server component streams. */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl space-y-5 p-6">
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-16 w-full animate-pulse rounded-md border border-border bg-muted/40"
          />
        ))}
      </div>
    </main>
  );
}
