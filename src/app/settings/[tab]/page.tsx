import { redirect } from 'next/navigation';
import { requireUser } from '@/auth';

/**
 * Fallback for unknown /settings/<tab> segments. As of M19 every real tab
 * (profile, api-key, calendar, planning, cost, data) has its own page, so
 * this only catches typos → redirect to Profile.
 */
export default async function SettingsTabFallbackPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  await requireUser();
  await params;
  redirect('/settings/profile');
}
