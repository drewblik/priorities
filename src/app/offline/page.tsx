/** Cached offline fallback served by the service worker when a navigation
 *  fails with no network. Static (no auth, no data) so it can be precached. */
export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
      <p className="text-sm text-muted-foreground">
        Priorities needs a connection to load your council and plans.
        Reconnect and try again — your data is safe on the server.
      </p>
    </main>
  );
}
