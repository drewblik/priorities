import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { getTaskById, setTaskCompletion } from '@/lib/tasks';
import { CompleteTaskSchema, isFormPost } from '@/lib/priorities-validation';

export const runtime = 'nodejs';

function origin(req: Request): string {
  return new URL(req.url).origin;
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await getCurrentSession();
  const formPost = isFormPost(req);
  const { id } = await ctx.params;

  if (!session) {
    if (formPost) return NextResponse.redirect(`${origin(req)}/signin`, 303);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let bodyStatus: 'open' | 'done' | 'skipped' | undefined;
  let redirectBack: string | null = null;
  if (formPost) {
    const form = await req.formData();
    const s = form.get('status');
    const r = form.get('_redirect');
    if (typeof r === 'string' && r.startsWith('/')) redirectBack = r;
    if (typeof s === 'string') {
      const parsed = CompleteTaskSchema.safeParse({ status: s });
      if (parsed.success && parsed.data.status) bodyStatus = parsed.data.status;
    }
  } else {
    const json = await req.json().catch(() => null);
    const parsed = CompleteTaskSchema.safeParse(json);
    if (parsed.success && parsed.data.status) bodyStatus = parsed.data.status;
  }

  const existing = await getTaskById(session.user.id, id);
  if (!existing) {
    if (formPost) {
      const back = redirectBack ?? '/priorities';
      const sep = back.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${origin(req)}${back}${sep}error=not_found`, 303);
    }
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Default behaviour: toggle between open and done.
  const nextStatus =
    bodyStatus ?? (existing.status === 'done' ? 'open' : 'done');

  const updated = await setTaskCompletion(session.user.id, id, nextStatus);
  if (!updated) {
    if (formPost) {
      const back = redirectBack ?? `/priorities/${existing.ownerPriorityId}`;
      const sep = back.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${origin(req)}${back}${sep}error=save_failed`, 303);
    }
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  if (formPost) {
    const back = redirectBack ?? `/priorities/${existing.ownerPriorityId}`;
    const sep = back.includes('?') ? '&' : '?';
    return NextResponse.redirect(`${origin(req)}${back}${sep}task_completed=1`, 303);
  }
  return NextResponse.json(updated);
}
