import { NextResponse } from 'next/server';
import { verifyMagicLink } from '@/auth/magic-link';
import { createSession } from '@/auth/sessions';
import { setSessionCookie } from '@/auth/cookie';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(`${url.origin}/signin?error=missing_token`, 303);
  }

  const result = await verifyMagicLink(token);
  if (!result.ok) {
    return NextResponse.redirect(`${url.origin}/signin?error=${result.reason}`, 303);
  }

  const { token: sessionToken, expiresAt } = await createSession(result.user.id);
  await setSessionCookie(sessionToken, expiresAt);

  // Post-signin landing — proper first-time-vs-returning routing arrives in M4 once
  // the priorities table exists. For now, everyone lands on the home page.
  return NextResponse.redirect(`${url.origin}/`, 303);
}
