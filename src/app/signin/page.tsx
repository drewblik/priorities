import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/auth';
import { SignInForm } from './SignInForm';

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
  const errorCode = typeof params.error === 'string' ? params.error : null;
  const errorMessage = errorCode ? (ERROR_COPY[errorCode] ?? 'Something went wrong.') : null;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to Priorities</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your email — we&apos;ll send an 8-digit code. Type it back
          here and you stay in the app (no jumping out to the browser).
        </p>

        <SignInForm initialError={errorMessage} />

        <p className="mt-8 text-xs text-muted-foreground">
          No passwords. The email also has a tap-to-sign-in link if you&apos;re
          on desktop.
        </p>
      </div>
    </main>
  );
}
