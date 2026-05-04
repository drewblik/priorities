import { cache } from 'react';
import { redirect } from 'next/navigation';
import { readSessionCookie, clearSessionCookie } from './cookie';
import { validateSessionToken, deleteSession, type SessionWithUser } from './sessions';

export const getCurrentSession = cache(async (): Promise<SessionWithUser | null> => {
  const token = await readSessionCookie();
  if (!token) return null;
  return validateSessionToken(token);
});

export async function requireUser(): Promise<SessionWithUser> {
  const session = await getCurrentSession();
  if (!session) redirect('/signin');
  return session;
}

export async function signOutCurrentSession(): Promise<void> {
  const token = await readSessionCookie();
  if (token) await deleteSession(token);
  await clearSessionCookie();
}
