import { NextResponse } from 'next/server';
import type { ZodIssue } from 'zod';
import { getCurrentSession } from '@/auth';
import { softDeleteFeed, updateFeed } from '@/lib/calendar-feeds';
import {
  UpdateCalendarFeedSchema,
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

type Ctx = { params: Promise<{ id: string }> };

async function handle(req: Request, ctx: Ctx) {
  const session = await getCurrentSession();
  const formPost = isFormPost(req);
  const { id } = await ctx.params;

  if (!session) {
    if (formPost) return NextResponse.redirect(`${origin(req)}/signin`, 303);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let action: string | null = null;
  let formPayload: Record<string, unknown> = {};
  if (formPost) {
    const form = await req.formData();
    const a = form.get('_action');
    if (typeof a === 'string') action = a;
    formPayload = formDataToCalendarFeedPayload(form);
  }

  if (req.method === 'DELETE' || action === 'delete') {
    const ok = await softDeleteFeed(session.user.id, id);
    if (!ok) {
      if (formPost) {
        return NextResponse.redirect(
          `${origin(req)}/settings/calendar?error=not_found`,
          303,
        );
      }
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (formPost) {
      return NextResponse.redirect(`${origin(req)}/settings/calendar?feed_deleted=1`, 303);
    }
    return NextResponse.json({ deleted: true });
  }

  const payload = formPost ? formPayload : await req.json().catch(() => null);
  const parsed = UpdateCalendarFeedSchema.safeParse(payload);
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

  const updated = await updateFeed(session.user.id, id, parsed.data);
  if (!updated) {
    if (formPost) {
      return NextResponse.redirect(`${origin(req)}/settings/calendar?error=not_found`, 303);
    }
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (formPost) {
    return NextResponse.redirect(`${origin(req)}/settings/calendar?feed_saved=1`, 303);
  }
  return NextResponse.json(updated);
}

export const PATCH = handle;
export const POST = handle;
export const DELETE = handle;
