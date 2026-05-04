import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { createFileRecord, isBlobConfigured } from '@/lib/priority-files';
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES, isAllowedMime } from '@/lib/priorities-validation';

export const runtime = 'nodejs';

function origin(req: Request): string {
  return new URL(req.url).origin;
}

type Ctx = { params: Promise<{ id: string }> };

function isFormPost(req: Request): boolean {
  const ct = req.headers.get('content-type') ?? '';
  return ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded');
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await getCurrentSession();
  const formPost = isFormPost(req);
  const { id: priorityId } = await ctx.params;
  const detailUrl = `${origin(req)}/priorities/${priorityId}`;

  if (!session) {
    if (formPost) return NextResponse.redirect(`${origin(req)}/signin`, 303);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!isBlobConfigured()) {
    if (formPost) return NextResponse.redirect(`${detailUrl}?error=blob_not_configured`, 303);
    return NextResponse.json({ error: 'blob_not_configured' }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) {
    if (formPost) return NextResponse.redirect(`${detailUrl}?error=file_missing`, 303);
    return NextResponse.json({ error: 'file_missing' }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    if (formPost) return NextResponse.redirect(`${detailUrl}?error=file_too_large`, 303);
    return NextResponse.json({ error: 'file_too_large' }, { status: 400 });
  }

  if (!isAllowedMime(file.type)) {
    if (formPost) return NextResponse.redirect(`${detailUrl}?error=mime_not_allowed`, 303);
    return NextResponse.json(
      { error: 'mime_not_allowed', allowed: ALLOWED_MIME_TYPES },
      { status: 400 },
    );
  }

  let blobUrl: string;
  try {
    const blob = await put(`priorities/${priorityId}/${Date.now()}-${file.name}`, file, {
      access: 'public',
      contentType: file.type,
      addRandomSuffix: true,
    });
    blobUrl = blob.url;
  } catch (err) {
    console.error('blob put failed:', err instanceof Error ? err.message : err);
    if (formPost) return NextResponse.redirect(`${detailUrl}?error=upload_failed`, 303);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }

  const created = await createFileRecord(session.user.id, priorityId, {
    filename: file.name,
    blobUrl,
    mimeType: file.type,
    sizeBytes: file.size,
  });
  if (!created) {
    if (formPost) return NextResponse.redirect(`${origin(req)}/priorities?error=not_found`, 303);
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (formPost) return NextResponse.redirect(`${detailUrl}?file_uploaded=1`, 303);
  return NextResponse.json(created, { status: 201 });
}
