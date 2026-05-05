import { redirect } from 'next/navigation';
import { requireUser } from '@/auth';
import { ensureCurrentQuarter } from '@/lib/quarters';

export default async function QuarterPlanRedirect() {
  const session = await requireUser();
  const active = await ensureCurrentQuarter(session.user.id, session.user.timezone);
  redirect(`/plan/quarter/${active.id}`);
}
