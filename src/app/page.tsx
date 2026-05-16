import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/auth';
import { isFirstRun } from '@/lib/onboarding';

export default async function HomePage() {
  const session = await getCurrentSession();
  if (!session) redirect('/signin');
  // First-run = no priorities + never completed onboarding → interview.
  if (await isFirstRun(session.user.id)) redirect('/onboarding');
  redirect('/today');
}
