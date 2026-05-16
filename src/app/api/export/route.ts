import { eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { db } from '@/db/client';
import {
  calendarFeedConfigs,
  calendarFeedEvents,
  chatMessages,
  chatSessions,
  events,
  priorities,
  priorityFiles,
  priorityMemory,
  quarterWeekFocus,
  quarters,
  tasks,
  userSettings,
  users,
} from '@/db/schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

const REDACTED = '[REDACTED]';

/**
 * Full data export (TDD §1598 / acceptance #13). JSON attachment with
 * EVERY user-owned row INCLUDING soft-deleted ones (so it doubles as the
 * v1 trash-recovery path). Secrets are redacted: the encrypted Anthropic
 * API key and encrypted calendar feed URLs.
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const [
    userRows,
    settingsRows,
    priorityRows,
    quarterRows,
    chatSessionRows,
  ] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)),
    db.select().from(userSettings).where(eq(userSettings.userId, userId)),
    db.select().from(priorities).where(eq(priorities.userId, userId)),
    db.select().from(quarters).where(eq(quarters.userId, userId)),
    db.select().from(chatSessions).where(eq(chatSessions.userId, userId)),
  ]);

  const priorityIds = priorityRows.map((p) => p.id);
  const sessionIds = chatSessionRows.map((s) => s.id);
  const quarterIds = quarterRows.map((q) => q.id);

  const [
    memoryRows,
    fileRows,
    taskRows,
    eventRows,
    feedConfigRows,
    feedEventRows,
    qwfRows,
    messageRows,
  ] = await Promise.all([
    priorityIds.length
      ? db.select().from(priorityMemory).where(inArray(priorityMemory.priorityId, priorityIds))
      : Promise.resolve([]),
    priorityIds.length
      ? db.select().from(priorityFiles).where(inArray(priorityFiles.priorityId, priorityIds))
      : Promise.resolve([]),
    db.select().from(tasks).where(eq(tasks.userId, userId)),
    db.select().from(events).where(eq(events.userId, userId)),
    db.select().from(calendarFeedConfigs).where(eq(calendarFeedConfigs.userId, userId)),
    db.select().from(calendarFeedEvents).where(eq(calendarFeedEvents.userId, userId)),
    quarterIds.length
      ? db.select().from(quarterWeekFocus).where(inArray(quarterWeekFocus.quarterId, quarterIds))
      : Promise.resolve([]),
    sessionIds.length
      ? db.select().from(chatMessages).where(inArray(chatMessages.sessionId, sessionIds))
      : Promise.resolve([]),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    schema_note:
      'Includes soft-deleted rows (deleted_at not null). Secrets redacted.',
    user: userRows[0] ?? null,
    user_settings: settingsRows[0]
      ? { ...settingsRows[0], anthropicApiKey: settingsRows[0].anthropicApiKey ? REDACTED : null }
      : null,
    priorities: priorityRows,
    priority_memory: memoryRows,
    priority_files: fileRows,
    quarters: quarterRows,
    quarter_week_focus: qwfRows,
    tasks: taskRows,
    events: eventRows,
    calendar_feed_configs: feedConfigRows.map((c) => ({
      ...c,
      feedUrl: REDACTED,
    })),
    calendar_feed_events: feedEventRows,
    chat_sessions: chatSessionRows,
    chat_messages: messageRows,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="priorities-export-${stamp}.json"`,
    },
  });
}
