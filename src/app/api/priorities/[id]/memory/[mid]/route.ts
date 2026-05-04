import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { softDeleteMemoryEntry, updateMemoryEntry } from '@/lib/priority-memory';
import {
  UpdateMemorySchema,
  formDataToMemoryPayload,
  isFormPost,
} from '@/lib/priorities-validation';

export const runtime = 'nodejs';

function origin(req: Request): string {
  return new URL(req.url).origin;
}

type Ctx = { params: Promise<{ id: string; mid: string }> };

async function handle(req: Request, ctx: Ctx) {
  const session = await getCurrentSession();
  const formPost = isFormPost(req);
  const { id: priorityId, mid } = await ctx.params;

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
    formPayload = formDataToMemoryPayload(form);
  }

  if (req.method === 'DELETE' || action === 'delete') {
    const ok = await softDeleteMemoryEntry(session.user.id, priorityId, mid);
    if (!ok) {
      if (formPost) {
        return NextResponse.redirect(
          `${origin(req)}/priorities/${priorityId}?error=not_found`,
          303,
        );
      }
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (formPost) {
      return NextResponse.redirect(
        `${origin(req)}/priorities/${priorityId}?memory_deleted=1`,
        303,
      );
    }
    return NextResponse.json({ deleted: true });
  }

  // PATCH / form-edit
  const payload = formPost ? formPayload : await req.json().catch(() => null);
  const parsed = UpdateMemorySchema.safeParse(payload);
  if (!parsed.success) {
    if (formPost) {
      return NextResponse.redirect(
        `${origin(req)}/priorities/${priorityId}?error=memory_validation`,
        303,
      );
    }
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const updated = await updateMemoryEntry(session.user.id, priorityId, mid, parsed.data);
  if (!updated) {
    if (formPost) {
      return NextResponse.redirect(`${origin(req)}/priorities/${priorityId}?error=not_found`, 303);
    }
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (formPost) {
    return NextResponse.redirect(
      `${origin(req)}/priorities/${priorityId}?memory_saved=1`,
      303,
    );
  }
  return NextResponse.json(updated);
}

export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
