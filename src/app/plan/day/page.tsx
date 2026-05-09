import { redirect } from 'next/navigation';
import { requireUser } from '@/auth';
import { tomorrowInTz } from '@/lib/daily-utils';

export default async function DailyPlanRedirect() {
  const session = await requireUser();
  const tomorrow = tomorrowInTz(session.user.timezone);
  redirect(`/plan/day/${tomorrow}`);
}
