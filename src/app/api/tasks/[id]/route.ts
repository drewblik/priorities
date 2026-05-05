import { NextResponse } from 'next/server';
import { fromZonedTime } from 'date-fns-tz';
import { getCurrentSession } from '@/auth';
import { getTaskById, softDeleteTask, updateTask } from '@/lib/tasks';
import {
  UpdateTaskSchema,
  formDataToTaskPayload,
  isFormPost,
} from '@/lib/priorities-validation';

export const runtime = 'nodejs';

function origin(req: Request): string {
  return new URL(req.url).origin;
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
  let redirectBack: string | null = null;
  let formPayload: Record<string, unknown> = {};
  if (formPost) {
    const form = await req.formData();
    const a = form.get('_action');
    if (typeof a === 'string') action = a;
    const r = form.get('_redirect');
    if (typeof r === 'string' && r.startsWith('/')) redirectBack = r;
    formPayload = formDataToTaskPayload(form);
  }

  if (req.method === 'DELETE' || action === 'delete') {
    const existing = await getTaskById(session.user.id, id);
    const fallbackBack = existing
      ? `/priorities/${existing.ownerPriorityId}`
      : '/priorities';

    const ok = await softDeleteTask(session.user.id, id);
    if (!ok) {
      if (formPost) {
        const back = redirectBack ?? fallbackBack;
        const sep = back.includes('?') ? '&' : '?';
        return NextResponse.redirect(`${origin(req)}${back}${sep}error=not_found`, 303);
      }
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (formPost) {
      const back = redirectBack ?? fallbackBack;
      const sep = back.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${origin(req)}${back}${sep}task_deleted=1`, 303);
    }
    return NextResponse.json({ deleted: true });
  }

  // PATCH (or POST with form, no _action=delete) -> edit
  const payload = formPost ? formPayload : await req.json().catch(() => null);
  const parsed = UpdateTaskSchema.safeParse(payload);
  if (!parsed.success) {
    if (formPost) {
      const back = redirectBack ?? `/priorities`;
      const sep = back.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${origin(req)}${back}${sep}error=validation_failed`, 303);
    }
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const tz = session.user.timezone;
  const patch: Parameters<typeof updateTask>[2] = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.targetDate !== undefined) patch.targetDate = parsed.data.targetDate;
  if (parsed.data.timeBlockStart !== undefined) {
    patch.timeBlockStart = parsed.data.timeBlockStart
      ? fromZonedTime(parsed.data.timeBlockStart, tz)
      : null;
  }
  if (parsed.data.timeBlockEnd !== undefined) {
    patch.timeBlockEnd = parsed.data.timeBlockEnd
      ? fromZonedTime(parsed.data.timeBlockEnd, tz)
      : null;
  }
  if (parsed.data.recurrence !== undefined) patch.recurrence = parsed.data.recurrence;
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;

  if (
    patch.timeBlockStart instanceof Date &&
    patch.timeBlockEnd instanceof Date &&
    patch.timeBlockEnd <= patch.timeBlockStart
  ) {
    if (formPost) {
      const back = redirectBack ?? `/priorities`;
      const sep = back.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${origin(req)}${back}${sep}error=validation_failed`, 303);
    }
    return NextResponse.json({ error: 'time_block_end_must_follow_start' }, { status: 400 });
  }

  const updated = await updateTask(session.user.id, id, patch);
  if (!updated) {
    if (formPost) {
      const back = redirectBack ?? `/priorities`;
      const sep = back.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${origin(req)}${back}${sep}error=not_found`, 303);
    }
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (formPost) {
    const back = redirectBack ?? `/priorities/${updated.ownerPriorityId}`;
    const sep = back.includes('?') ? '&' : '?';
    return NextResponse.redirect(`${origin(req)}${back}${sep}task_saved=1`, 303);
  }
  return NextResponse.json(updated);
}

export const PATCH = handle;
export const POST = handle;
export const DELETE = handle;
