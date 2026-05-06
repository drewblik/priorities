import { redirect } from 'next/navigation';
import { requireUser } from '@/auth';
import { weekStartForDate } from '@/lib/week-utils';

export default async function WeeklyPlanRedirect() {
  const session = await requireUser();
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = weekStartForDate(today, session.user.timezone);
  redirect(`/plan/week/${weekStart}`);
}
