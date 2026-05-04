import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/auth';

export default async function HomePage() {
  const session = await getCurrentSession();
  if (!session) redirect('/signin');

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Priorities</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{session.user.email}</span>
        </p>
        <p className="mt-8 text-xs text-muted-foreground">
          M3 (settings + API key) complete. Priorities List arrives in M4.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <a
            href="/settings/profile"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Settings
          </a>
          <form method="post" action="/api/auth/signout">
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
