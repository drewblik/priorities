import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { createPriority } from '@/lib/priorities';
import {
  CreatePrioritySchema,
  formDataToPriorityPayload,
  isFormPost,
} from '@/lib/priorities-validation';

export const runtime = 'nodejs';

function origin(req: Request): string {
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  const formPost = isFormPost(req);

  if (!session) {
    if (formPost) return NextResponse.redirect(`${origin(req)}/signin`, 303);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  if (formPost) {
    const form = await req.formData();
    payload = formDataToPriorityPayload(form);
  } else {
    payload = await req.json().catch(() => null);
  }

  const parsed = CreatePrioritySchema.safeParse(payload);
  if (!parsed.success) {
    if (formPost) {
      return NextResponse.redirect(
        `${origin(req)}/priorities/new?error=validation_failed`,
        303,
      );
    }
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let created;
  try {
    created = await createPriority(session.user.id, {
      name: parsed.data.name,
      icon: parsed.data.icon,
      smartGoal: parsed.data.smartGoal ?? null,
      quarterlyStrategy: parsed.data.quarterlyStrategy ?? null,
      weeklyStrategy: parsed.data.weeklyStrategy ?? null,
      dailyStrategy: parsed.data.dailyStrategy ?? null,
      minMinutesPerWeek: parsed.data.minMinutesPerWeek,
      maxMinutesPerWeek: parsed.data.maxMinutesPerWeek,
      checkInCadence: parsed.data.checkInCadence,
    });
  } catch (err) {
    console.error('createPriority failed:', err instanceof Error ? err.message : err);
    if (formPost) {
      return NextResponse.redirect(`${origin(req)}/priorities/new?error=save_failed`, 303);
    }
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  if (formPost) {
    return NextResponse.redirect(`${origin(req)}/priorities?created=1`, 303);
  }
  return NextResponse.json(created, { status: 201 });
}
