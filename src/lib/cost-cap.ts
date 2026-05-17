import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { chatSessions, userSettings, users } from '@/db/schema';
import { tokensToUsd } from './anthropic-pricing';
import type { AnthropicModelId } from './anthropic-models';

/**
 * Sum chat_sessions.total_cost_usd for sessions opened today (in user's TZ).
 * "Today" boundary is computed via Postgres AT TIME ZONE for the user's
 * stored timezone — same direction as M9's user-TZ bounds for events.
 */
export async function sumTodayCost(userId: string): Promise<number> {
  const rows = await db
    .select({
      sum: sql<string>`COALESCE(SUM(${chatSessions.totalCostUsd}), 0)`,
    })
    .from(chatSessions)
    .innerJoin(userSettings, eq(userSettings.userId, chatSessions.userId))
    .where(
      and(
        eq(chatSessions.userId, userId),
        isNull(chatSessions.deletedAt),
        sql`(${chatSessions.openedAt} AT TIME ZONE (
          SELECT timezone FROM users WHERE id = ${userId}
        ))::date = (NOW() AT TIME ZONE (
          SELECT timezone FROM users WHERE id = ${userId}
        ))::date`,
      ),
    );
  return Number.parseFloat(rows[0]?.sum ?? '0');
}

/** Sum chat_sessions.total_cost_usd for sessions opened in the current
 *  calendar month (user's TZ). */
export async function sumMonthCost(userId: string): Promise<number> {
  const rows = await db
    .select({
      sum: sql<string>`COALESCE(SUM(${chatSessions.totalCostUsd}), 0)`,
    })
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.userId, userId),
        isNull(chatSessions.deletedAt),
        sql`date_trunc('month', ${chatSessions.openedAt} AT TIME ZONE (
          SELECT timezone FROM users WHERE id = ${userId}
        )) = date_trunc('month', NOW() AT TIME ZONE (
          SELECT timezone FROM users WHERE id = ${userId}
        ))`,
      ),
    );
  return Number.parseFloat(rows[0]?.sum ?? '0');
}

export type CostCapResult =
  | { ok: true; todayUsd: number; monthUsd: number }
  | {
      ok: false;
      reason: string;
      todayUsd: number;
      monthUsd: number;
      dailyCapUsd: number;
      monthlyCapUsd: number;
    };

/**
 * Pre-call cost gate. Sums today's + this month's existing spend and
 * checks `existing + projectedUsd` against both caps.
 */
export async function withinCostCap(
  userId: string,
  projectedUsd: number,
): Promise<CostCapResult> {
  const settingsRows = await db
    .select({
      dailyCap: userSettings.dailyCostCapUsd,
      monthlyCap: userSettings.monthlyCostCapUsd,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const dailyCap = Number.parseFloat(settingsRows[0]?.dailyCap ?? '5.00');
  const monthlyCap = Number.parseFloat(settingsRows[0]?.monthlyCap ?? '50.00');

  const [todayUsd, monthUsd] = await Promise.all([sumTodayCost(userId), sumMonthCost(userId)]);

  if (todayUsd + projectedUsd > dailyCap) {
    return {
      ok: false,
      reason: `Daily cost cap of $${dailyCap.toFixed(2)} would be exceeded ($${(
        todayUsd + projectedUsd
      ).toFixed(4)} projected)`,
      todayUsd,
      monthUsd,
      dailyCapUsd: dailyCap,
      monthlyCapUsd: monthlyCap,
    };
  }
  if (monthUsd + projectedUsd > monthlyCap) {
    return {
      ok: false,
      reason: `Monthly cost cap of $${monthlyCap.toFixed(2)} would be exceeded ($${(
        monthUsd + projectedUsd
      ).toFixed(4)} projected)`,
      todayUsd,
      monthUsd,
      dailyCapUsd: dailyCap,
      monthlyCapUsd: monthlyCap,
    };
  }
  return { ok: true, todayUsd, monthUsd };
}

/**
 * Increment chat_sessions.total_cost_usd for the session by the cost of one
 * API call. Called after the response usage is known.
 */
export async function recordCallCost(
  sessionId: string,
  modelId: AnthropicModelId,
  usage: { input_tokens: number; output_tokens: number },
): Promise<number> {
  const usd = tokensToUsd(modelId, usage.input_tokens, usage.output_tokens);
  await db
    .update(chatSessions)
    .set({
      totalCostUsd: sql`${chatSessions.totalCostUsd} + ${usd.toFixed(6)}`,
    })
    .where(eq(chatSessions.id, sessionId));
  return usd;
}

// Suppress unused-import warning for `gte` (kept for symmetry with M9-style
// patterns; will be used as the cap helpers grow).
void gte;

export type CostStatus = {
  todayUsd: number;
  monthUsd: number;
  dailyCapUsd: number;
  monthlyCapUsd: number;
  dailyPct: number; // 0..1+ (can exceed 1 if overshot)
  monthlyPct: number;
  /** worst of the two, drives banner: 'ok' | 'warn' (>=80%) | 'blocked' (>=100%) */
  level: 'ok' | 'warn' | 'blocked';
};

/** Headline numbers + derived banner level. Used by the Cost & Usage tab
 *  and the app-wide cost banner. */
export async function getCostStatus(userId: string): Promise<CostStatus> {
  const settingsRows = await db
    .select({
      dailyCap: userSettings.dailyCostCapUsd,
      monthlyCap: userSettings.monthlyCostCapUsd,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const dailyCapUsd = Number.parseFloat(settingsRows[0]?.dailyCap ?? '5.00');
  const monthlyCapUsd = Number.parseFloat(settingsRows[0]?.monthlyCap ?? '50.00');

  const [todayUsd, monthUsd] = await Promise.all([
    sumTodayCost(userId),
    sumMonthCost(userId),
  ]);

  const dailyPct = dailyCapUsd > 0 ? todayUsd / dailyCapUsd : 0;
  const monthlyPct = monthlyCapUsd > 0 ? monthUsd / monthlyCapUsd : 0;
  const worst = Math.max(dailyPct, monthlyPct);
  const level: CostStatus['level'] =
    worst >= 1 ? 'blocked' : worst >= 0.8 ? 'warn' : 'ok';

  return {
    todayUsd,
    monthUsd,
    dailyCapUsd,
    monthlyCapUsd,
    dailyPct,
    monthlyPct,
    level,
  };
}

export type CostBreakdownRow = { sessionType: string; totalUsd: number };
export type CostTrendPoint = { date: string; usd: number };

/** Per-session-type spend (all-time) + last-30-day daily trend, both in
 *  user TZ. Powers the Cost & Usage tab's breakdown + sparkline. */
export async function getCostBreakdown(userId: string): Promise<{
  byType: CostBreakdownRow[];
  trend: CostTrendPoint[];
}> {
  const byTypeRows = await db
    .select({
      sessionType: chatSessions.sessionType,
      total: sql<string>`COALESCE(SUM(${chatSessions.totalCostUsd}), 0)`,
    })
    .from(chatSessions)
    .where(and(eq(chatSessions.userId, userId), isNull(chatSessions.deletedAt)))
    .groupBy(chatSessions.sessionType);

  // Resolve the user's tz in JS, then bind it as a plain text param.
  // Postgres's GROUP BY grouping-equality check does not reliably match
  // expressions that embed a scalar subquery, so the subquery form that
  // works fine in sumToday/Month WHERE clauses throws here. A bound string
  // avoids the subquery entirely.
  const tzRows = await db
    .select({ tz: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const tz = tzRows[0]?.tz ?? 'America/Los_Angeles';

  const trendRows = await db
    .select({
      day: sql<string>`(${chatSessions.openedAt} AT TIME ZONE ${tz})::date::text`,
      total: sql<string>`COALESCE(SUM(${chatSessions.totalCostUsd}), 0)`,
    })
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.userId, userId),
        isNull(chatSessions.deletedAt),
        sql`(${chatSessions.openedAt} AT TIME ZONE ${tz})::date >= (NOW() AT TIME ZONE ${tz})::date - INTERVAL '29 days'`,
      ),
    )
    .groupBy(sql`(${chatSessions.openedAt} AT TIME ZONE ${tz})::date`);

  return {
    byType: byTypeRows
      .map((r) => ({
        sessionType: r.sessionType,
        totalUsd: Number.parseFloat(r.total ?? '0'),
      }))
      .filter((r) => r.totalUsd > 0)
      .sort((a, b) => b.totalUsd - a.totalUsd),
    trend: trendRows
      .map((r) => ({ date: r.day, usd: Number.parseFloat(r.total ?? '0') }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
