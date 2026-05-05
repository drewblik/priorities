import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { reorderPriorities } from '@/lib/priorities';
import { ReorderSchema } from '@/lib/priorities-validation';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = ReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await reorderPriorities(session.user.id, parsed.data.ids);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(
      'reorderPriorities failed:',
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : err,
      'ids:',
      parsed.data.ids,
    );
    return NextResponse.json({ error: 'save_failed', detail }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
