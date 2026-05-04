import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/auth';

type SearchParams = { [key: string]: string | string[] | undefined };

const ERROR_COPY: Record<string, string> = {
  missing_email: 'Please enter your email address.',
  send_failed: "We couldn't send the email. Try again in a moment.",
  missing_token: 'That link was incomplete. Request a new one.',
  invalid: 'That link is invalid. Request a new one.',
  expired: 'That link expired. Request a new one.',
  used: 'That link was already used. Request a new one.',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getCurrentSession();
  if (session) redirect('/');

  const params = await searchParams;
  const sent = params.sent === '1';
  const errorCode = typeof params.error === 'string' ? params.error : null;
  const errorMessage = errorCode ? (ERROR_COPY[errorCode] ?? 'Something went wrong.') : null;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to Priorities</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a magic link.
        </p>

        {sent ? (
          <div className="mt-6 rounded-lg border border-border bg-muted px-4 py-5 text-sm">
            <p className="font-medium">Check your email.</p>
            <p className="mt-1 text-muted-foreground">
              We sent a sign-in link. It expires in 15 minutes and can only be used once.
            </p>
          </div>
        ) : (
          <form
            method="post"
            action="/api/auth/magic-link"
            className="mt-6 space-y-3"
          >
            <input
              type="email"
              name="email"
              required
              autoFocus
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Send magic link
            </button>
            {errorMessage ? (
              <p className="text-sm text-red-600">{errorMessage}</p>
            ) : null}
          </form>
        )}

        <p className="mt-8 text-xs text-muted-foreground">
          No password — magic links only.
        </p>
      </div>
    </main>
  );
}
