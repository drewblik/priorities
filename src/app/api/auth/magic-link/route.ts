import { NextResponse } from 'next/server';
import { issueAndSendMagicLink } from '@/auth/magic-link';

export const runtime = 'nodejs';

async function readEmail(req: Request): Promise<string | null> {
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
    return typeof body?.email === 'string' ? body.email : null;
  }
  const form = await req.formData().catch(() => null);
  const value = form?.get('email');
  return typeof value === 'string' ? value : null;
}

function isFormPost(req: Request): boolean {
  const ct = req.headers.get('content-type') ?? '';
  return ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data');
}

function origin(req: Request): string {
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  const email = await readEmail(req);
  const formPost = isFormPost(req);

  if (!email) {
    if (formPost) return NextResponse.redirect(`${origin(req)}/signin?error=missing_email`, 303);
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  try {
    await issueAndSendMagicLink(email);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('magic-link issue failed:', message);
    if (formPost) return NextResponse.redirect(`${origin(req)}/signin?error=send_failed`, 303);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (formPost) {
    return NextResponse.redirect(`${origin(req)}/signin?sent=1`, 303);
  }
  return NextResponse.json({ ok: true });
}
