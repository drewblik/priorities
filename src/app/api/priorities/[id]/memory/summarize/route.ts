import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { summarizePriorityMemory } from '@/lib/memory-summarize';

export const runtime = 'nodejs';
export const maxDuration = 60;

function origin(req: Request): string {
  return new URL(req.url).origin;
}

/** Manual "Compress memory" trigger from Priority Detail. Accepts a form
 *  POST (redirects back) so it works as a plain button without JS. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  const { id } = await params;

  if (!session) {
    return NextResponse.redirect(`${origin(req)}/signin`, 303);
  }

  const result = await summarizePriorityMemory(session.user.id, id);
  const back = `${origin(req)}/priorities/${id}`;
  if (result.ok) {
    return NextResponse.redirect(`${back}?memory_compressed=${result.archived}`, 303);
  }
  // Benign no-ops shouldn't look like errors.
  if (result.reason === 'nothing_to_archive' || result.reason === 'summarize_in_progress') {
    return NextResponse.redirect(
      `${back}?memory_note=${encodeURIComponent(result.reason)}`,
      303,
    );
  }
  return NextResponse.redirect(
    `${back}?error=compress_${encodeURIComponent(result.reason)}`,
    303,
  );
}
