'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const HIDDEN_PATHS = new Set(['/signin', '/chat']);

/**
 * Floating "open master chat" button. Lives in the root layout and
 * self-decides visibility based on the current path. Rendered as a fixed
 * bottom-right pill on every authed page; hidden on /signin (no auth) and
 * /chat (already there). Other unauthed routes also fall through if they
 * exist (signin currently is the only one).
 */
export function MasterChatButton() {
  const pathname = usePathname();
  if (!pathname) return null;
  if (HIDDEN_PATHS.has(pathname)) return null;

  // Encode the current path so it round-trips through the URL even if it
  // already has query params.
  const fromParam = encodeURIComponent(pathname);

  return (
    <Link
      href={`/chat?from=${fromParam}`}
      aria-label="Open master chat"
      className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg hover:opacity-90"
    >
      <span aria-hidden="true">💬</span>
      Chat
    </Link>
  );
}
