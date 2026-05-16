import Link from 'next/link';
import { requireUser } from '@/auth';
import { getPrioritiesForUser } from '@/lib/priorities';
import { ProposalReview } from '../ProposalReview';

export default async function ProposalPage() {
  const session = await requireUser();
  const existing = await getPrioritiesForUser(session.user.id, {
    includeArchived: true,
  });
  const hasExistingCouncil = existing.length > 0;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl space-y-5 p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Review your council
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit anything, remove what doesn&apos;t fit, then accept. Nothing
            is saved until you tap Accept.
          </p>
        </div>
        <Link
          href="/onboarding"
          className="whitespace-nowrap text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to interview
        </Link>
      </header>

      <ProposalReview hasExistingCouncil={hasExistingCouncil} />
    </main>
  );
}
