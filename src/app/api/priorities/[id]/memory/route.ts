import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { createMemoryEntry } from '@/lib/priority-memory';
import {
  CreateMemorySchema,
  formDataToMemoryPayload,
  isFormPost,
} from '@/lib/priorities-validation';

export const runtime = 'nodejs';

function origin(req: Request): string {
  return new URL(req.url).origin;
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await getCurrentSession();
  const formPost = isFormPost(req);
  const { id: priorityId } = await ctx.params;

  if (!session) {
    if (formPost) return NextResponse.redirect(`${origin(req)}/signin`, 303);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  if (formPost) {
    const form = await req.formData();
    payload = formDataToMemoryPayload(form);
  } else {
    payload = await req.json().catch(() => null);
  }

  const parsed = CreateMemorySchema.safeParse(payload);
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

  const created = await createMemoryEntry(session.user.id, priorityId, parsed.data);
  if (!created) {
    if (formPost) {
      return NextResponse.redirect(`${origin(req)}/priorities?error=not_found`, 303);
    }
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (formPost) {
    return NextResponse.redirect(`${origin(req)}/priorities/${priorityId}?memory_added=1`, 303);
  }
  return NextResponse.json(created, { status: 201 });
}
