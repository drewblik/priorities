import Link from 'next/link';
import { requireUser } from '@/auth';
import { getPrioritiesForUser } from '@/lib/priorities';
import { PriorityCard } from './PriorityCard';

export default async function CouncilHomePage() {
  const session = await requireUser();
  const priorities = await getPrioritiesForUser(session.user.id);

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Council</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as <span className="text-foreground">{session.user.email}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings/profile"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Settings
          </Link>
          <form method="post" action="/api/auth/signout">
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* M7 will add quarter info here. M11+ will add planning status banners. */}

      <section className="mt-6">
        {priorities.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-2">
            {priorities.map((priority) => (
              <li key={priority.id}>
                <PriorityCard priority={priority} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs text-muted-foreground">
        M4 (read-only Council Home) live. Creating, editing, and reordering Priorities arrives in M5.
      </p>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-8 text-center">
      <p className="text-sm font-medium text-foreground">No Priorities yet.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        The Create Priority button arrives in M5. For now, this is just the read-only list scaffold.
      </p>
    </div>
  );
}
