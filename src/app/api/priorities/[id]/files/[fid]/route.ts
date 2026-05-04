import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { softDeleteFileRecord } from '@/lib/priority-files';

export const runtime = 'nodejs';

function origin(req: Request): string {
  return new URL(req.url).origin;
}

function isFormPost(req: Request): boolean {
  const ct = req.headers.get('content-type') ?? '';
  return ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data');
}

type Ctx = { params: Promise<{ id: string; fid: string }> };

async function handle(req: Request, ctx: Ctx) {
  const session = await getCurrentSession();
  const formPost = isFormPost(req);
  const { id: priorityId, fid } = await ctx.params;
  const detailUrl = `${origin(req)}/priorities/${priorityId}`;

  if (!session) {
    if (formPost) return NextResponse.redirect(`${origin(req)}/signin`, 303);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Only DELETE semantics here. Form posts use _action=delete; explicit DELETE
  // method also works. POST without _action=delete is treated as a no-op delete
  // (forms can't issue DELETE without JS).
  if (formPost) {
    const form = await req.formData();
    const action = form.get('_action');
    if (action !== 'delete') {
      return NextResponse.redirect(`${detailUrl}?error=unknown_action`, 303);
    }
  }

  const ok = await softDeleteFileRecord(session.user.id, priorityId, fid);
  if (!ok) {
    if (formPost) return NextResponse.redirect(`${detailUrl}?error=not_found`, 303);
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (formPost) return NextResponse.redirect(`${detailUrl}?file_deleted=1`, 303);
  return NextResponse.json({ deleted: true });
}

export const POST = handle;
export const DELETE = handle;
