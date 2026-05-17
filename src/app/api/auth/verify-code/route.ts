import { NextResponse } from 'next/server';
import { verifyMagicLinkCode } from '@/auth/magic-link';
import { createSession } from '@/auth/sessions';
import { setSessionCookie } from '@/auth/cookie';

export const runtime = 'nodejs';

/**
 * In-app code verification. The user types the 8-digit code from their
 * email directly in the PWA — no navigating out to a browser tab, which
 * is the iOS magic-link pain point. On success the session cookie is set
 * for THIS context (the standalone app).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: unknown; code?: unknown }
    | null;
  const email = typeof body?.email === 'string' ? body.email : '';
  const code = typeof body?.code === 'string' ? body.code : '';

  if (!email || !code) {
    return NextResponse.json({ error: 'email and code required' }, { status: 400 });
  }

  const result = await verifyMagicLinkCode(email, code);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  const { token, expiresAt } = await createSession(result.user.id);
  await setSessionCookie(token, expiresAt);
  return NextResponse.json({ ok: true });
}
