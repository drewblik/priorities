import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { softDeletePriority, updatePriority } from '@/lib/priorities';
import {
  UpdatePrioritySchema,
  formDataToPriorityPayload,
  isFormPost,
} from '@/lib/priorities-validation';

export const runtime = 'nodejs';

function origin(req: Request): string {
  return new URL(req.url).origin;
}

type Ctx = { params: Promise<{ id: string }> };

async function handlePatchOrDelete(req: Request, ctx: Ctx) {
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
    formPayload = formDataToPriorityPayload(form);
  }

  // Method-DELETE or form _action=delete: soft delete.
  if (req.method === 'DELETE' || action === 'delete') {
    const ok = await softDeletePriority(session.user.id, id);
    if (!ok) {
      if (formPost) {
        return NextResponse.redirect(
          `${origin(req)}/priorities?error=not_found`,
          303,
        );
      }
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (formPost) {
      return NextResponse.redirect(`${origin(req)}/priorities?deleted=1`, 303);
    }
    return NextResponse.json({ deleted: true });
  }

  // Otherwise it's a PATCH (status change or full edit).
  const payload = formPost ? formPayload : await req.json().catch(() => null);
  const parsed = UpdatePrioritySchema.safeParse(payload);
  if (!parsed.success) {
    if (formPost) {
      return NextResponse.redirect(
        `${origin(req)}/priorities/${id}/edit?error=validation_failed`,
        303,
      );
    }
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const updated = await updatePriority(session.user.id, id, parsed.data);
  if (!updated) {
    if (formPost) {
      return NextResponse.redirect(`${origin(req)}/priorities?error=not_found`, 303);
    }
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (formPost) {
    return NextResponse.redirect(`${origin(req)}/priorities?saved=1`, 303);
  }
  return NextResponse.json(updated);
}

export const PATCH = handlePatchOrDelete;
export const POST = handlePatchOrDelete; // for HTML forms (POST with _action=delete or PATCH-via-form)
export const DELETE = handlePatchOrDelete;
