import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/auth';
import {
  acceptCouncilProposal,
  closeOnboardingSession,
} from '@/lib/onboarding';
import { getPrioritiesForUser } from '@/lib/priorities';
import { ensureCurrentQuarter } from '@/lib/quarters';
import type { ProposedPriority } from '@/lib/onboarding-proposal-tools';

export const runtime = 'nodejs';

const PrioritySchema = z.object({
  name: z.string().min(1).max(120),
  icon: z.object({
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    style: z.enum(['classic', 'rounded', 'serif', 'script']),
  }),
  smart_goal: z.string().max(2000).default(''),
  quarterly_strategy: z.string().max(2000).default(''),
  weekly_strategy: z.string().max(2000).default(''),
  daily_strategy: z.string().max(2000).default(''),
  min_minutes_per_week: z.number().int().min(0).max(10000),
  max_minutes_per_week: z.number().int().min(0).max(10000),
  check_in_cadence: z
    .array(z.enum(['quarterly', 'weekly', 'daily']))
    .min(1),
  starter_memory_entries: z
    .array(
      z.object({
        body: z.string().min(1).max(10000),
        tags: z.array(z.string()).max(10).default([]),
      }),
    )
    .default([]),
});

const BodySchema = z.object({
  priorities: z.array(PrioritySchema).min(1).max(12),
  mode: z.enum(['fresh', 'add', 'replace']).default('fresh'),
  /** Required typed confirmation when mode='replace'. */
  confirm: z.string().optional(),
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

  const { priorities, mode, confirm } = parsed.data;
  const userId = session.user.id;

  if (mode === 'replace' && confirm !== 'REPLACE') {
    return NextResponse.json(
      { error: 'confirm_required', message: 'Type REPLACE to replace your council.' },
      { status: 400 },
    );
  }

  // Gate: 'add'/'replace' only make sense if a council already exists.
  // 'fresh' is the first-run path.
  const existing = await getPrioritiesForUser(userId, { includeArchived: true });
  const effectiveMode =
    existing.length === 0 ? 'fresh' : mode === 'fresh' ? 'add' : mode;

  const result = await acceptCouncilProposal(
    userId,
    priorities as ProposedPriority[],
    effectiveMode,
  );

  // First quarter is created at onboarding acceptance (TDD §864).
  await ensureCurrentQuarter(userId, session.user.timezone);
  await closeOnboardingSession(userId);

  return NextResponse.json({
    ok: true,
    created: result.created,
    failed: result.failed,
  });
}
