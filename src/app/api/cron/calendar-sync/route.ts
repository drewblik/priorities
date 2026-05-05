import { NextResponse } from 'next/server';
import { syncDueFeeds } from '@/lib/calendar-sync';

export const runtime = 'nodejs';
// Vercel cron invocations can take longer than the default 10s on a slow feed.
export const maxDuration = 60;

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('CRON_SECRET is not set; refusing to run sync.');
    return NextResponse.json({ error: 'cron_secret_unset' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const { syncedFeeds, errors } = await syncDueFeeds();
    return NextResponse.json({ ok: true, syncedFeeds, errors });
  } catch (err) {
    console.error(
      'syncDueFeeds crashed:',
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : err,
    );
    return NextResponse.json({ error: 'sync_crashed' }, { status: 500 });
  }
}
