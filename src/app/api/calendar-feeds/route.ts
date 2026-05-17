import { NextResponse } from 'next/server';
import type { ZodIssue } from 'zod';
import { getCurrentSession } from '@/auth';
import { createFeed, getFeedsForUser } from '@/lib/calendar-feeds';
import {
  CreateCalendarFeedSchema,
  formDataToCalendarFeedPayload,
  isFormPost,
} from '@/lib/priorities-validation';

export const runtime = 'nodejs';

function origin(req: Request): string {
  return new URL(req.url).origin;
}

function firstIssueMsg(issues: ZodIssue[]): string {
  const first = issues[0];
  if (!first) return 'Invalid input.';
  const path = first.path.length > 0 ? first.path.join('.') : '';
  return path ? `${path}: ${first.message}` : first.message;
}

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const feeds = await getFeedsForUser(session.user.id);
  return NextResponse.json(feeds);
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  const formPost = isFormPost(req);
  if (!session) {
    if (formPost) return NextResponse.redirect(`${origin(req)}/signin`, 303);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  if (formPost) {
    const form = await req.formData();
    payload = formDataToCalendarFeedPayload(form);
  } else {
    payload = await req.json().catch(() => null);
  }

  const parsed = CreateCalendarFeedSchema.safeParse(payload);
  if (!parsed.success) {
    if (formPost) {
      const issue = encodeURIComponent(firstIssueMsg(parsed.error.issues));
      return NextResponse.redirect(
        `${origin(req)}/settings/calendar?error=validation_failed&validation_issue=${issue}`,
        303,
      );
    }
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let created;
  try {
    created = await createFeed(session.user.id, {
      name: parsed.data.name,
      source: parsed.data.source,
      feedUrl: parsed.data.feedUrl,
      calendarEmail: parsed.data.calendarEmail ?? null,
      syncCadenceMin: parsed.data.syncCadenceMin,
    });
  } catch (err) {
    console.error('createFeed failed:', err instanceof Error ? err.message : err);
    if (formPost) {
      return NextResponse.redirect(
        `${origin(req)}/settings/calendar?error=save_failed`,
        303,
      );
    }
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  if (formPost) {
    return NextResponse.redirect(`${origin(req)}/settings/calendar?feed_added=1`, 303);
  }
  return NextResponse.json(created, { status: 201 });
}
