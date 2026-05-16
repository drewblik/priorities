import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/auth';
import { extractAssistantText, loadThread } from '@/lib/chat-messages';
import { getOrCreateOnboardingSession } from '@/lib/onboarding';
import { OnboardingChatPanel, type OnboardingInitial } from './OnboardingChatPanel';

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireUser();
  const sp = await searchParams;
  const restart = sp.restart === '1';

  // ?restart=1 (from Settings) closes the prior session and starts fresh,
  // then redirects to the clean URL so a refresh doesn't restart again.
  if (restart) {
    await getOrCreateOnboardingSession(session.user.id, { restart: true });
    redirect('/onboarding');
  }

  const chatSession = await getOrCreateOnboardingSession(session.user.id);
  const thread = await loadThread(chatSession.id);
  const initialMessages = thread
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m): { role: 'user' | 'assistant'; text: string } => {
      if (typeof m.content === 'string') {
        return { role: m.role as 'user' | 'assistant', text: m.content };
      }
      return {
        role: m.role as 'user' | 'assistant',
        text: extractAssistantText(m.content as ContentBlockParam[]),
      };
    })
    .filter((m) => m.text.trim().length > 0);

  const initial: OnboardingInitial = { initialMessages };

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl space-y-5 p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Let&apos;s build your council
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A quick interview so Priorities can propose a starter set of
            Priorities tailored to your life. Nothing is saved until you
            review and accept.
          </p>
        </div>
        <Link
          href="/today"
          className="whitespace-nowrap text-sm text-muted-foreground hover:text-foreground"
        >
          Skip for now →
        </Link>
      </header>

      <OnboardingChatPanel initial={initial} />
    </main>
  );
}
