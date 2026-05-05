import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { getFeedByIdInternal } from '@/lib/calendar-feeds';
import { syncFeed } from '@/lib/calendar-sync';
import { isFormPost } from '@/lib/priorities-validation';

export const runtime = 'nodejs';
// Manual sync calls fetch + parse + DB upsert — give it room to breathe.
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

  let id: string | null = null;
  if (formPost) {
    const form = await req.formData();
    const v = form.get('id');
    if (typeof v === 'string') id = v;
  } else {
    const body = (await req.json().catch(() => null)) as { id?: string } | null;
    id = body?.id ?? null;
  }

  if (!id) {
    if (formPost) {
      return NextResponse.redirect(
        `${origin(req)}/settings/calendar?error=validation_failed`,
        303,
      );
    }
    return NextResponse.json({ error: 'id_required' }, { status: 400 });
  }

  const config = await getFeedByIdInternal(session.user.id, id);
  if (!config) {
    if (formPost) {
      return NextResponse.redirect(`${origin(req)}/settings/calendar?error=not_found`, 303);
    }
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const result = await syncFeed(config);
  if (formPost) {
    if (!result.success) {
      const issue = encodeURIComponent(result.error ?? 'sync failed');
      return NextResponse.redirect(
        `${origin(req)}/settings/calendar?error=sync_failed&validation_issue=${issue}`,
        303,
      );
    }
    return NextResponse.redirect(
      `${origin(req)}/settings/calendar?feed_synced=1`,
      303,
    );
  }
  return NextResponse.json(result);
}
