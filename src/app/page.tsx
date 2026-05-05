import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/auth';

export default async function HomePage() {
  const session = await getCurrentSession();
  if (!session) redirect('/signin');
  redirect('/today');
}
