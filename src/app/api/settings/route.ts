import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/auth';
import { ANTHROPIC_MODEL_IDS } from '@/lib/anthropic-models';
import { VERBOSITY_IDS } from '@/lib/chatbot-verbosity';
import { applySettingsPatch, getSettingsView, type SettingsPatch } from '@/lib/settings';

export const runtime = 'nodejs';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const PatchSchema = z.object({
  name: z.union([z.string().trim().max(120), z.null()]).optional(),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(isValidTimeZone, { message: 'invalid IANA timezone' })
    .optional(),
  anthropicApiKey: z.union([z.string().trim().min(1).max(500), z.null()]).optional(),
  selectedModel: z.enum(ANTHROPIC_MODEL_IDS as unknown as [string, ...string[]]).optional(),
  chatbotVerbosity: z.enum(VERBOSITY_IDS as unknown as [string, ...string[]]).optional(),
  dailyCostCapUsd: z.number().nonnegative().max(10_000).optional(),
  monthlyCostCapUsd: z.number().nonnegative().max(100_000).optional(),
  planningDayOfWeek: z.number().int().min(0).max(6).optional(),
  eveningReviewTime: z
    .string()
    .regex(TIME_RE, 'expected HH:MM or HH:MM:SS')
    .transform((v) => (v.length === 5 ? `${v}:00` : v))
    .optional(),
});

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isFormPost(req: Request): boolean {
  const ct = req.headers.get('content-type') ?? '';
  return ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data');
}

function origin(req: Request): string {
  return new URL(req.url).origin;
}

const VALID_REDIRECTS = new Set([
  '/settings/profile',
  '/settings/api-key',
  '/settings/calendar',
  '/settings/planning',
  '/settings/data',
]);

function safeRedirect(raw: string | null): string {
  if (raw && VALID_REDIRECTS.has(raw)) return raw;
  return '/settings/profile';
}

async function readPatch(req: Request): Promise<{ patch: unknown; redirect: string | null; isForm: boolean }> {
  if (isFormPost(req)) {
    const form = await req.formData();
    const patch: Record<string, unknown> = {};
    const action = form.get('_action');
    if (typeof action === 'string' && action === 'clear-api-key') {
      patch.anthropicApiKey = null;
    }
    for (const [key, value] of form.entries()) {
      if (key.startsWith('_')) continue;
      if (typeof value !== 'string') continue;
      if (value === '') continue;
      if (key === 'dailyCostCapUsd' || key === 'monthlyCostCapUsd') {
        patch[key] = Number(value);
      } else if (key === 'planningDayOfWeek') {
        patch[key] = Number.parseInt(value, 10);
      } else {
        patch[key] = value;
      }
    }
    const redir = form.get('_redirect');
    return { patch, redirect: typeof redir === 'string' ? redir : null, isForm: true };
  }

  const body = await req.json().catch(() => null);
  return { patch: body ?? {}, redirect: null, isForm: false };
}

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const view = await getSettingsView(session.user.id);
  if (!view) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });

  return NextResponse.json(view);
}

async function handleWrite(req: Request) {
  const session = await getCurrentSession();
  const { patch, redirect, isForm } = await readPatch(req);

  if (!session) {
    if (isForm) return NextResponse.redirect(`${origin(req)}/signin`, 303);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = PatchSchema.safeParse(patch);
  if (!parsed.success) {
    if (isForm) {
      const back = safeRedirect(redirect);
      return NextResponse.redirect(`${origin(req)}${back}?error=validation_failed`, 303);
    }
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await applySettingsPatch(session.user.id, parsed.data as SettingsPatch);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('settings patch failed:', message);
    if (isForm) {
      const back = safeRedirect(redirect);
      return NextResponse.redirect(`${origin(req)}${back}?error=save_failed`, 303);
    }
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  if (isForm) {
    const back = safeRedirect(redirect);
    return NextResponse.redirect(`${origin(req)}${back}?saved=1`, 303);
  }

  const view = await getSettingsView(session.user.id);
  return NextResponse.json(view);
}

export const POST = handleWrite;
export const PATCH = handleWrite;
