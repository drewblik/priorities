import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/auth';
import { isIsoDate } from '@/lib/daily-utils';
import { updateEvent } from '@/lib/events';
import { setTaskCompletion, updateTask } from '@/lib/tasks';

export const runtime = 'nodejs';

const ITEM_RE = /^(task|event):(.+):(done|skipped|moved)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ProgressSchema = z.object({
  dateISO: z.string().refine((v) => isIsoDate(v), 'invalid date'),
  /** Each entry encodes kind, id, action; "moved" entries also carry a new
   *  target_date (passed as a separate form field keyed by `move-<id>`). */
  items: z.array(
    z.object({
      kind: z.enum(['task', 'event']),
      id: z.string().min(1),
      action: z.enum(['done', 'skipped', 'moved']),
      newDate: z.string().regex(DATE_RE).optional(),
    }),
  ),
});

function origin(req: Request): string {
  return new URL(req.url).origin;
}

async function readForm(
  req: Request,
): Promise<{ payload: { dateISO: string; items: ProgressItem[] }; redirect: string }> {
  const form = await req.formData();
  const dateISO = form.get('dateISO');
  const redirectRaw = form.get('_redirect');
  const items: ProgressItem[] = [];

  for (const [key, value] of form.entries()) {
    if (typeof value !== 'string') continue;
    if (!key.startsWith('action-')) continue;
    const itemRef = key.slice('action-'.length);
    const m = value.match(/^(done|skipped|moved)$/);
    if (!m) continue;
    const [kind, id] = itemRef.split(':');
    if (kind !== 'task' && kind !== 'event') continue;
    if (!id) continue;
    const action = m[1] as 'done' | 'skipped' | 'moved';
    const newDateRaw = form.get(`move-${itemRef}`);
    const newDate = typeof newDateRaw === 'string' && DATE_RE.test(newDateRaw) ? newDateRaw : undefined;
    items.push({ kind, id, action, newDate });
  }

  // Suppress lint about unused regex
  void ITEM_RE;

  return {
    payload: { dateISO: typeof dateISO === 'string' ? dateISO : '', items },
    redirect: typeof redirectRaw === 'string' ? redirectRaw : '/today',
  };
}

type ProgressItem = {
  kind: 'task' | 'event';
  id: string;
  action: 'done' | 'skipped' | 'moved';
  newDate?: string;
};

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.redirect(`${origin(req)}/signin`, 303);

  const { payload, redirect } = await readForm(req);
  const parsed = ProgressSchema.safeParse(payload);
  if (!parsed.success) {
    const back = sanitizeRedirect(redirect);
    return NextResponse.redirect(`${origin(req)}${back}?error=validation_failed`, 303);
  }

  const failures: string[] = [];
  for (const item of parsed.data.items) {
    try {
      if (item.kind === 'task') {
        if (item.action === 'done') {
          const ok = await setTaskCompletion(session.user.id, item.id, 'done');
          if (!ok) failures.push(`task ${item.id}`);
        } else if (item.action === 'skipped') {
          const ok = await setTaskCompletion(session.user.id, item.id, 'skipped');
          if (!ok) failures.push(`task ${item.id}`);
        } else if (item.action === 'moved') {
          if (!item.newDate) {
            failures.push(`task ${item.id}`);
            continue;
          }
          const ok = await updateTask(session.user.id, item.id, {
            targetDate: item.newDate,
            timeBlockStart: null,
            timeBlockEnd: null,
            status: 'open',
          });
          if (!ok) failures.push(`task ${item.id}`);
        }
      } else if (item.kind === 'event') {
        if (item.action === 'done') {
          const ok = await updateEvent(session.user.id, item.id, {
            completionStatus: 'attended',
          });
          if (!ok) failures.push(`event ${item.id}`);
        } else if (item.action === 'skipped') {
          const ok = await updateEvent(session.user.id, item.id, {
            completionStatus: 'missed',
          });
          if (!ok) failures.push(`event ${item.id}`);
        }
        // "Moved" doesn't apply to events at v1 (events are time-bound; a
        // moved event is structurally a new event). Silently skip; the form
        // doesn't render Move on event rows.
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'update failed';
      console.error(`progress update failed for ${item.kind} ${item.id}:`, message);
      failures.push(`${item.kind} ${item.id}`);
    }
  }

  const back = sanitizeRedirect(redirect);
  if (failures.length > 0) {
    return NextResponse.redirect(
      `${origin(req)}${back}?error=progress_partial&failed=${encodeURIComponent(failures.join(','))}`,
      303,
    );
  }
  return NextResponse.redirect(`${origin(req)}${back}?progress_saved=1`, 303);
}

function sanitizeRedirect(raw: string): string {
  // Allow only same-origin paths starting with /plan/day or /today.
  if (raw.startsWith('/plan/day') || raw === '/today' || raw.startsWith('/today?')) {
    return raw;
  }
  return '/today';
}
