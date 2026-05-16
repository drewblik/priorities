import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/auth';
import { executePreview } from '@/lib/master-chat-execute';
import type { MasterChatResponse } from '@/lib/master-chat-tools';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PREVIEW_TTL_MS = 5 * 60 * 1000; // 5 minutes per TDD §679

const BodySchema = z.object({
  preview_generated_at: z.string().min(1),
  response: z
    .object({
      understanding: z.string(),
      affected_priorities: z.array(z.object({ id: z.string(), reasoning: z.string() })),
      proposed_actions: z.array(z.any()),
      preview_summary: z.string(),
      needs_clarification: z.string().optional(),
    })
    .passthrough(),
});

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { preview_generated_at, response } = parsed.data;

  // Expiry check.
  const generatedAt = new Date(preview_generated_at);
  if (Number.isNaN(generatedAt.getTime())) {
    return NextResponse.json(
      { error: 'invalid_preview_timestamp' },
      { status: 400 },
    );
  }
  const ageMs = Date.now() - generatedAt.getTime();
  if (ageMs > PREVIEW_TTL_MS) {
    return NextResponse.json(
      {
        error: 'preview_expired',
        message: `Preview is older than 5 minutes. Send your message again to get a fresh preview.`,
        age_ms: ageMs,
      },
      { status: 409 },
    );
  }
  if (ageMs < -60_000) {
    // Allow a tiny clock-skew window but reject obvious future-dated previews.
    return NextResponse.json(
      { error: 'invalid_preview_timestamp', message: 'preview timestamp is in the future' },
      { status: 400 },
    );
  }

  if (response.proposed_actions.length === 0) {
    return NextResponse.json(
      { error: 'no_actions', message: 'Preview has no actions to execute.' },
      { status: 400 },
    );
  }

  const result = await executePreview(response as MasterChatResponse, {
    userId: session.user.id,
    userTimezone: session.user.timezone,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.stage === 'validate' ? 'validation_failed' : 'execution_failed',
        message: result.reason,
        failed_action_index: result.failed_action_index,
        stage: result.stage,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    executed: result.executed,
  });
}
