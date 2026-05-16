import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { getCostStatus } from '@/lib/cost-cap';

export const runtime = 'nodejs';

/** Lightweight status read for the app-wide <CostCapBanner>. */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const status = await getCostStatus(session.user.id);
  return NextResponse.json(status);
}
