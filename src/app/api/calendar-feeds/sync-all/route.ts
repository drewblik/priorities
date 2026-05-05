import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { calendarFeedConfigs } from '@/db/schema';
import { getCurrentSession } from '@/auth';
import { syncFeed } from '@/lib/calendar-sync';
import { isFormPost } from '@/lib/priorities-validation';

export const runtime = 'nodejs';
export const maxDuration = 60;

function origin(req: Request): string {
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  const formPost = isFormPost(req);
  if (!session) {
    if (formPost) return NextResponse.redirect(`${origin(req)}/signin`, 303);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let redirectBack: string | null = null;
  if (formPost) {
    const form = await req.formData();
    const r = form.get('_redirect');
    if (typeof r === 'string' && r.startsWith('/')) redirectBack = r;
  }

  const feeds = await db
    .select()
    .from(calendarFeedConfigs)
    .where(
      and(
        eq(calendarFeedConfigs.userId, session.user.id),
        isNull(calendarFeedConfigs.deletedAt),
      ),
    );

  let synced = 0;
  let failed = 0;
  for (const feed of feeds) {
    try {
      const result = await syncFeed(feed);
      if (result.success) synced += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      console.error(
        `syncFeed crashed for config=${feed.id}:`,
        err instanceof Error ? `${err.name}: ${err.message}` : err,
      );
    }
  }

  if (formPost) {
    const back = redirectBack ?? '/settings/calendar';
    const sep = back.includes('?') ? '&' : '?';
    if (failed > 0) {
      return NextResponse.redirect(
        `${origin(req)}${back}${sep}error=sync_failed&validation_issue=${encodeURIComponent(
          `${synced} synced, ${failed} failed`,
        )}`,
        303,
      );
    }
    return NextResponse.redirect(`${origin(req)}${back}${sep}feeds_synced=1`, 303);
  }
  return NextResponse.json({ ok: failed === 0, synced, failed, total: feeds.length });
}
