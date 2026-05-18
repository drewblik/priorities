import { addDays } from 'date-fns';
import ICAL from 'ical.js';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  calendarFeedConfigs,
  calendarFeedEvents,
  type CalendarFeedConfig,
} from '@/db/schema';
import { newId } from '@/lib/id';
import { decryptFeedUrl, recordFeedSyncResult } from '@/lib/calendar-feeds';

export type ParsedEvent = {
  externalId: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  /** M21 Phase 2. false = firmly on your calendar (accepted / busy / you
   *  organized it) — hard immovable block. true = on your calendar but you
   *  haven't firmly accepted (tentative / no RSVP) — STILL hard-blocks, but
   *  the UI flags it amber as an RSVP nudge. Events you declined or that
   *  publish as free are not stored at all (see `classifyVevent`). */
  tentative: boolean;
};

export type SyncFeedResult = {
  success: boolean;
  upserted: number;
  reconciled: { hardDeleted: number; markedRemoved: number };
  error?: string;
};

// ---------------------------------------------------------------------------
// M21 Phase 1 — RSVP-signal diagnostic.
//
// Counts only. NO PII: never records titles, names, emails, or attendee
// addresses — just which RSVP-bearing properties the feed carries and how
// their values are distributed. Surfaced read-only in Settings → Calendar so
// the owner can confirm which signal an Outlook-published feed actually
// exposes BEFORE the Phase-2 accepted-only filter is written against it.
// Computed once per VEVENT component (not per expanded recurrence occurrence):
// RSVP props live on the master, and "does this feed carry signal" is a
// per-event question. Cheap relative to recurrence expansion + the fetch.
// ---------------------------------------------------------------------------

type Tally<K extends string> = Record<K, number>;

const PARTSTAT_KEYS = [
  'ACCEPTED',
  'TENTATIVE',
  'DECLINED',
  'NEEDS-ACTION',
  'DELEGATED',
  'OTHER',
] as const;
const STATUS_KEYS = ['CONFIRMED', 'TENTATIVE', 'CANCELLED', 'NONE', 'OTHER'] as const;
const XCDO_KEYS = ['FREE', 'TENTATIVE', 'BUSY', 'OOF', 'NONE', 'OTHER'] as const;
const TRANSP_KEYS = ['OPAQUE', 'TRANSPARENT', 'NONE', 'OTHER'] as const;

export type RsvpDebug = {
  vevents: number;
  emailSet: boolean;
  /** VEVENTs with an ATTENDEE whose address equals the configured email. */
  attendeeMatched: number;
  /** VEVENTs whose ORGANIZER address equals the configured email. */
  organizerIsUser: number;
  /** VEVENTs that carry at least one ATTENDEE (email-independent). */
  anyAttendee: number;
  /** PARTSTAT distribution of the matched attendee only. */
  matchedPartstat: Tally<(typeof PARTSTAT_KEYS)[number]>;
  status: Tally<(typeof STATUS_KEYS)[number]>;
  xCdoBusystatus: Tally<(typeof XCDO_KEYS)[number]>;
  transp: Tally<(typeof TRANSP_KEYS)[number]>;
  /** emailSet && no matched-attendee PARTSTAT && not organizer — i.e. the
   *  feed gave us no primary RSVP signal for the user on this event. */
  noPrimarySignal: number;
};

function zeroTally<K extends string>(keys: readonly K[]): Tally<K> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Tally<K>;
}

function up(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  return s === '' ? null : s;
}

/** Normalize a CAL-ADDRESS ("mailto:Foo@Bar.com", "MAILTO:foo@bar.com",
 *  bare address) to a comparable lowercased email. */
function calAddr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/^mailto:/i, '').trim().toLowerCase();
  return s === '' ? null : s;
}

function bump<K extends string>(
  m: Tally<K>,
  raw: string | null,
  hasNone: boolean,
): void {
  const key = (
    raw == null ? (hasNone ? 'NONE' : 'OTHER') : raw in m ? raw : 'OTHER'
  ) as K;
  m[key] = (m[key] ?? 0) + 1;
}

export function summarizeRsvp(
  vevents: ICAL.Component[],
  calendarEmail: string | null,
): RsvpDebug {
  const email = calendarEmail ? calendarEmail.trim().toLowerCase() : null;
  const d: RsvpDebug = {
    vevents: vevents.length,
    emailSet: !!email,
    attendeeMatched: 0,
    organizerIsUser: 0,
    anyAttendee: 0,
    matchedPartstat: zeroTally(PARTSTAT_KEYS),
    status: zeroTally(STATUS_KEYS),
    xCdoBusystatus: zeroTally(XCDO_KEYS),
    transp: zeroTally(TRANSP_KEYS),
    noPrimarySignal: 0,
  };

  for (const ve of vevents) {
    bump(d.status, up(ve.getFirstPropertyValue('status')), true);
    bump(d.xCdoBusystatus, up(ve.getFirstPropertyValue('x-microsoft-cdo-busystatus')), true);
    bump(d.transp, up(ve.getFirstPropertyValue('transp')), true);

    const attendees = ve.getAllProperties('attendee');
    if (attendees.length > 0) d.anyAttendee += 1;

    if (!email) continue;

    let matchedPs: string | null = null;
    for (const a of attendees) {
      if (calAddr(a.getFirstValue()) === email) {
        const ps = a.getParameter('partstat');
        matchedPs = up(Array.isArray(ps) ? ps[0] : ps) ?? 'NEEDS-ACTION';
        break;
      }
    }
    const org = ve.getFirstProperty('organizer');
    const orgIsUser = org ? calAddr(org.getFirstValue()) === email : false;

    if (matchedPs != null) {
      d.attendeeMatched += 1;
      bump(d.matchedPartstat, matchedPs, false);
    }
    if (orgIsUser) d.organizerIsUser += 1;
    if (matchedPs == null && !orgIsUser) d.noPrimarySignal += 1;
  }

  return d;
}

function tallyStr<K extends string>(m: Tally<K>, keys: readonly K[]): string {
  return keys.map((k) => `${k} ${m[k]}`).join(' ');
}

/** Compact, PII-free, phone-readable summary for `last_sync_debug`. */
export function formatRsvpDebug(d: RsvpDebug): string {
  const lines = [`RSVP diag · ${d.vevents} events parsed`];
  if (!d.emailSet) {
    lines.push(
      'email: NOT SET — nothing is filtered (current behavior). Set "Your email',
      'on this calendar" on this feed + Sync now to populate matched/PARTSTAT.',
    );
  } else {
    lines.push(
      `email: SET · matched-attendee ${d.attendeeMatched} · organizer=you ${d.organizerIsUser} · no-primary-signal ${d.noPrimarySignal}`,
      `PARTSTAT(you): ${tallyStr(d.matchedPartstat, PARTSTAT_KEYS)}`,
    );
  }
  lines.push(
    `has-attendees: ${d.anyAttendee}/${d.vevents}`,
    `STATUS: ${tallyStr(d.status, STATUS_KEYS)}`,
    `X-CDO-BUSY: ${tallyStr(d.xCdoBusystatus, XCDO_KEYS)}`,
    `TRANSP: ${tallyStr(d.transp, TRANSP_KEYS)}`,
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// M21 Phase 2 — accepted-only filter.
//
// Decides, per VEVENT, whether to store the event and whether to flag it
// `tentative`. Policy locked with the owner (PROJECT-STATUS § M21):
//
//   • STATUS:CANCELLED            → drop (always, opt-in or not).
//   • Feed has no configured email (`calendar_email` NULL) → import every
//     event unchanged (pre-M21 behavior; the owner's "Test" feed is opt-out
//     by leaving the address blank).
//   • Your ATTENDEE PARTSTAT, when the feed exposes it (authoritative):
//       ACCEPTED / you are ORGANIZER → keep, hard block.
//       TENTATIVE / NEEDS-ACTION     → keep, `tentative` (you forget to RSVP;
//                                       owner wants these — still blocks).
//       DECLINED / DELEGATED         → drop.
//   • Outlook-published feeds strip attendees entirely (Phase-1 diagnostic
//     proved has-attendees 0/N), so fall back to the free/busy publication
//     that IS present:
//       X-MICROSOFT-CDO-BUSYSTATUS  FREE → drop · TENTATIVE → `tentative`
//                                   BUSY / OOF → keep, hard block.
//       then TRANSP TRANSPARENT      → drop.
//   • Opted-in but the feed carries NO RSVP/busy signal for this event →
//     SAFE DEFAULT: keep as a hard block. Never silently hide a real meeting.
//
// Honest limitation (disclosed to the owner): with attendees stripped we
// infer "declined" from "published as free". A meeting declined but still
// published as Busy/Tentative is indistinguishable from a real one — there
// is no data to separate them. In practice Outlook sets declined → free.
// ---------------------------------------------------------------------------

export type EventClassification = { drop: boolean; tentative: boolean };

const KEEP_HARD: EventClassification = { drop: false, tentative: false };
const KEEP_TENTATIVE: EventClassification = { drop: false, tentative: true };
const DROP: EventClassification = { drop: true, tentative: false };

export function classifyVevent(
  ve: ICAL.Component,
  calendarEmail: string | null,
): EventClassification {
  // Unambiguous "this event is off" — drop regardless of opt-in.
  if (up(ve.getFirstPropertyValue('status')) === 'CANCELLED') return DROP;

  const email = calendarEmail ? calendarEmail.trim().toLowerCase() : null;
  // Opt-in gate: no address on this feed → import everything unchanged.
  if (!email) return KEEP_HARD;

  // Primary signal: your own ATTENDEE PARTSTAT (authoritative when present).
  let matchedPs: string | null = null;
  for (const a of ve.getAllProperties('attendee')) {
    if (calAddr(a.getFirstValue()) === email) {
      const ps = a.getParameter('partstat');
      matchedPs = up(Array.isArray(ps) ? ps[0] : ps) ?? 'NEEDS-ACTION';
      break;
    }
  }
  if (matchedPs != null) {
    if (matchedPs === 'DECLINED' || matchedPs === 'DELEGATED') return DROP;
    if (matchedPs === 'ACCEPTED') return KEEP_HARD;
    return KEEP_TENTATIVE; // TENTATIVE / NEEDS-ACTION
  }
  const org = ve.getFirstProperty('organizer');
  if (org && calAddr(org.getFirstValue()) === email) return KEEP_HARD;

  // No PARTSTAT for you (Outlook-published feed) → free/busy fallback.
  const xcdo = up(ve.getFirstPropertyValue('x-microsoft-cdo-busystatus'));
  if (xcdo === 'FREE') return DROP;
  if (xcdo === 'TENTATIVE') return KEEP_TENTATIVE;
  if (xcdo === 'BUSY' || xcdo === 'OOF') return KEEP_HARD;

  if (up(ve.getFirstPropertyValue('transp')) === 'TRANSPARENT') return DROP;

  // Opted-in but no signal at all → safe default: keep as a hard block.
  return KEEP_HARD;
}

// Two attempts at 25s each (≈50s worst case, under Vercel Hobby's 60s
// function ceiling). Outlook published .ics endpoints are slow on a cold
// request but the fetch primes a server-side cache, so the retry usually
// lands fast. A feed that fails both 25s attempts is a documented Hobby
// limitation (→ M21 / Vercel Pro / out-of-band ingestion).
const FETCH_TIMEOUT_MS = 25_000;
const FETCH_ATTEMPTS = 2;

// Chunk sizes to stay under Postgres's ~65535 bind-parameter ceiling. A busy
// Outlook feed expands (RRULE over the ±60-day horizon) into thousands of
// rows; the upsert writes 11 cols/row so 400 rows ≈ 4.4k params. The id-list
// delete/update is 1 param/id, so 1000 ids/batch is comfortably safe.
const UPSERT_BATCH = 50;
const ID_BATCH = 1000;

// Microsoft Teams meetings carry huge description blobs (join links, "Need
// help?", legal boilerplate — often many KB each). Storing them verbatim
// bloats the Neon HTTP write body past its limit on a busy work calendar.
// We only need enough description for planning context, so clip hard.
const MAX_TITLE_CHARS = 200;
const MAX_DESC_CHARS = 500;

function clip(s: string | null | undefined, max: number): string | null {
  if (s == null) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Drizzle wraps driver errors and stuffs the ENTIRE failing SQL + every
 * bound parameter into `.message` ("Failed query: insert into ... values
 * ($1...$2992) ... params: <thousands of values>"). The actual reason
 * (NeonDbError: request too large / statement timeout / etc.) lives on the
 * `.cause` chain. This walks to the deepest real message, strips the params
 * tail, and hard-caps length so `last_sync_error` is human-readable.
 */
function conciseError(err: unknown): string {
  const chain: string[] = [];
  let cur: unknown = err;
  const seen = new Set<unknown>();
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as { message?: unknown; cause?: unknown };
    if (typeof e.message === 'string' && e.message) chain.push(e.message);
    cur = e.cause;
  }
  const real = [...chain].reverse().find((m) => !m.startsWith('Failed query:'));
  const picked = real ?? chain[0] ?? String(err);
  return picked.split(' params:')[0].replace(/\s+/g, ' ').trim().slice(0, 300);
}

// Hard ceiling on events stored per sync. A large Outlook calendar can
// RRULE-expand into tens of thousands of instances; fetch + parse + write
// must finish inside Vercel Hobby's 60s function ceiling. We keep the
// soonest MAX_PARSED_EVENTS (sorted by start) since Day/Week views and
// conflict detection are all near-term. The full-fidelity fix (accepted-
// only filter + Vercel Pro 5-min ceiling) is the next calendar change.
const MAX_PARSED_EVENTS = 1500;

/** Sync horizon — past 7 days through next 45. M21 Phase 2 partially
 *  restores this from the interim 35 (toward the TDD's 60). NOT a full
 *  restore: the diagnostic showed the accepted-only filter drops only ~5%
 *  of this feed (the FREE bucket); the dominant Busy/Tentative volume is
 *  kept, so the filter did NOT cut volume the way the original plan assumed.
 *  Dropping declined/free series before recurrence expansion buys some
 *  headroom (a dropped recurring VEVENT no longer expands), but 60 still
 *  risks the parse/write timeout that forced the original 60→35 cut. 45 is
 *  the measured middle, well under the 60s Hobby ceiling with the 1500-event
 *  cap unchanged. Full restore stays gated on the Vercel Pro / paginated-
 *  ingestion backlog item. */
export function getSyncHorizon(now: Date = new Date()): { start: Date; end: Date } {
  return { start: addDays(now, -7), end: addDays(now, 45) };
}

/**
 * Fetch + parse an .ics URL. Expands recurring VEVENTs into per-instance
 * ParsedEvents within the horizon. Throws on network/parse failure.
 */
export async function fetchAndParseIcs(
  url: string,
  horizon: { start: Date; end: Date } = getSyncHorizon(),
  calendarEmail: string | null = null,
): Promise<{ events: ParsedEvent[]; debug: RsvpDebug }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
        headers: { Accept: 'text/calendar, text/plain, */*' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return parseIcs(text, horizon, calendarEmail);
    } catch (err) {
      lastErr = err;
      // Retry once on the cold-fetch timeout/5xx; the 2nd request usually
      // hits the provider's now-warm cache.
      if (attempt < FETCH_ATTEMPTS) continue;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function parseIcs(
  text: string,
  horizon: { start: Date; end: Date },
  calendarEmail: string | null = null,
): { events: ParsedEvent[]; debug: RsvpDebug } {
  const jcal = ICAL.parse(text);
  const cal = new ICAL.Component(jcal);
  const vevents = cal.getAllSubcomponents('vevent');
  const debug = summarizeRsvp(vevents, calendarEmail);
  const horizonStart = ICAL.Time.fromJSDate(horizon.start, true);
  const horizonEnd = ICAL.Time.fromJSDate(horizon.end, true);

  const out: ParsedEvent[] = [];
  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    if (!event.uid) continue;

    // M21 Phase 2 filter. Classify once per VEVENT (RSVP/busy lives on the
    // master, same as the diagnostic). Dropping here — before recurrence
    // expansion — also means a declined/free recurring series never expands
    // into thousands of occurrences (the horizon-headroom win).
    const cls = classifyVevent(vevent, calendarEmail);
    if (cls.drop) continue;

    if (event.isRecurring()) {
      const iterator = event.iterator();
      // Cap iterations defensively in case of malformed RRULE without UNTIL/COUNT.
      let safetyN = 0;
      // Use loose != null because ical.js's iterator returns undefined (not
      // strict null) at exhaustion, which a `!== null` guard would walk past.
      let next: ICAL.Time | null | undefined;
      while ((next = iterator.next()) != null) {
        if (++safetyN > 1000) break;
        if (next.compare(horizonEnd) > 0) break;
        if (next.compare(horizonStart) < 0) continue;
        try {
          const occ = event.getOccurrenceDetails(next);
          const allDay = occ.startDate.isDate === true;
          out.push({
            externalId: `${event.uid}__${occ.startDate.toString()}`,
            title: clip(occ.item.summary || '(no title)', MAX_TITLE_CHARS) ?? '(no title)',
            description: clip(occ.item.description || null, MAX_DESC_CHARS),
            startTime: occ.startDate.toJSDate(),
            endTime: occ.endDate.toJSDate(),
            allDay,
            tentative: cls.tentative,
          });
        } catch {
          // Some recurrence-id exceptions throw; skip and continue.
        }
      }
    } else {
      const start = event.startDate?.toJSDate();
      if (!start) continue;
      if (start < horizon.start || start > horizon.end) continue;
      const end = event.endDate?.toJSDate() ?? new Date(start.getTime() + 30 * 60_000);
      const allDay = event.startDate?.isDate === true;
      out.push({
        externalId: event.uid,
        title: clip(event.summary || '(no title)', MAX_TITLE_CHARS) ?? '(no title)',
        description: clip(event.description || null, MAX_DESC_CHARS),
        startTime: start,
        endTime: end,
        allDay,
        tentative: cls.tentative,
      });
    }
  }

  // Bound the result to the soonest MAX_PARSED_EVENTS. Events past the cut
  // aren't stored; reconcile will treat them as removed (boundary events may
  // churn slightly between syncs — acceptable + self-correcting at v1 scale).
  if (out.length > MAX_PARSED_EVENTS) {
    out.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    return { events: out.slice(0, MAX_PARSED_EVENTS), debug };
  }
  return { events: out, debug };
}

/**
 * Upsert + reconcile a single feed. Idempotent — re-running on the same .ics
 * leaves the DB unchanged. Errors land in the config's `last_sync_error` and
 * the function returns `{ success: false, error }`.
 */
export async function syncFeed(config: CalendarFeedConfig): Promise<SyncFeedResult> {
  const startedAt = new Date();
  let parsed: ParsedEvent[];
  let debugStr: string;
  try {
    const url = decryptFeedUrl(config);
    const r = await fetchAndParseIcs(url, getSyncHorizon(), config.calendarEmail);
    parsed = r.events;
    debugStr = formatRsvpDebug(r.debug);
  } catch (err) {
    const msg = conciseError(err);
    // Fetch/parse failed → no diagnostic to write; preserve the previous
    // last_sync_debug (omit `debug` so it isn't overwritten).
    await recordFeedSyncResult(config.id, { success: false, error: msg, at: startedAt });
    return { success: false, upserted: 0, reconciled: { hardDeleted: 0, markedRemoved: 0 }, error: msg };
  }

  // Outlook republishes the same UID repeatedly (recurring master +
  // RECURRENCE-ID modified occurrences, plus plain duplicate VEVENTs). Two
  // rows sharing (source_feed_id, external_id) in one INSERT ... ON CONFLICT
  // make Postgres throw "ON CONFLICT DO UPDATE command cannot affect row a
  // second time". Collapse to one row per externalId (last occurrence wins —
  // a modified occurrence appears after its master in the feed).
  parsed = Array.from(new Map(parsed.map((e) => [e.externalId, e])).values());

  const fetchedIds = new Set(parsed.map((e) => e.externalId));

  // The DB phase (upsert + reconcile) is guarded: a busy Outlook feed can
  // expand to thousands of rows, and any failure here must land in
  // `last_sync_error` and return `{ success: false }` — never escape as an
  // uncaught throw (which the route would surface as an opaque 500 with
  // `last_synced_at` left null).
  try {
    // Upsert all parsed events. Drizzle's onConflictDoUpdate with the unique
    // index target maps to ON CONFLICT (source_feed_id, external_id). The SET
    // clause uses `excluded.<col>` so each row's new values land. Re-appearing
    // rows clear `removed_from_source_at`. Chunked to stay under Postgres's
    // bind-parameter ceiling on large recurring feeds.
    let upserted = 0;
    if (parsed.length > 0) {
      const rows = parsed.map((e) => ({
        id: newId('cfe'),
        sourceFeedId: config.id,
        userId: config.userId,
        externalId: e.externalId,
        title: e.title,
        description: e.description,
        startTime: e.startTime,
        endTime: e.endTime,
        allDay: e.allDay,
        tentative: e.tentative,
        lastSyncedAt: startedAt,
        removedFromSourceAt: null,
      }));
      for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
        await db
          .insert(calendarFeedEvents)
          .values(rows.slice(i, i + UPSERT_BATCH))
          .onConflictDoUpdate({
            target: [calendarFeedEvents.sourceFeedId, calendarFeedEvents.externalId],
            set: {
              title: sql`excluded.title`,
              description: sql`excluded.description`,
              startTime: sql`excluded.start_time`,
              endTime: sql`excluded.end_time`,
              allDay: sql`excluded.all_day`,
              tentative: sql`excluded.tentative`,
              lastSyncedAt: sql`excluded.last_synced_at`,
              removedFromSourceAt: sql`NULL`,
            },
          });
      }
      upserted = rows.length;
    }

    // Reconcile: rows in DB whose external_id is NOT in fetchedIds AND not
    // already marked removed. Future-dated removals are hard-deleted; past-dated
    // get `removed_from_source_at` set so retrospective views can show them
    // with an "ⓧ removed from calendar" badge (TDD §725-748).
    const existing = await db
      .select({
        id: calendarFeedEvents.id,
        externalId: calendarFeedEvents.externalId,
        startTime: calendarFeedEvents.startTime,
      })
      .from(calendarFeedEvents)
      .where(
        and(
          eq(calendarFeedEvents.sourceFeedId, config.id),
          isNull(calendarFeedEvents.removedFromSourceAt),
        ),
      );

    const futureToDelete: string[] = [];
    const pastToMarkRemoved: string[] = [];
    for (const row of existing) {
      if (fetchedIds.has(row.externalId)) continue;
      if (row.startTime > startedAt) {
        futureToDelete.push(row.id);
      } else {
        pastToMarkRemoved.push(row.id);
      }
    }

    for (let i = 0; i < futureToDelete.length; i += ID_BATCH) {
      await db
        .delete(calendarFeedEvents)
        .where(inArray(calendarFeedEvents.id, futureToDelete.slice(i, i + ID_BATCH)));
    }
    for (let i = 0; i < pastToMarkRemoved.length; i += ID_BATCH) {
      await db
        .update(calendarFeedEvents)
        .set({ removedFromSourceAt: startedAt })
        .where(inArray(calendarFeedEvents.id, pastToMarkRemoved.slice(i, i + ID_BATCH)));
    }

    await recordFeedSyncResult(config.id, {
      success: true,
      at: startedAt,
      debug: debugStr,
    });
    return {
      success: true,
      upserted,
      reconciled: {
        hardDeleted: futureToDelete.length,
        markedRemoved: pastToMarkRemoved.length,
      },
    };
  } catch (err) {
    const msg = conciseError(err);
    // Parse succeeded but the DB write failed — the diagnostic is still
    // valid and worth surfacing, so persist it alongside the error.
    await recordFeedSyncResult(config.id, {
      success: false,
      error: msg,
      at: startedAt,
      debug: debugStr,
    });
    return {
      success: false,
      upserted: 0,
      reconciled: { hardDeleted: 0, markedRemoved: 0 },
      error: msg,
    };
  }
}

/**
 * Cron entry point: select all feeds that are due (no last_synced_at, or
 * last_synced_at + sync_cadence_min has passed) across all users, and sync
 * each. Optimistic — see plan note about not using FOR UPDATE SKIP LOCKED;
 * idempotent upserts make double-sync from overlapping cron runs harmless at
 * v1 scale.
 */
export async function syncDueFeeds(): Promise<{ syncedFeeds: number; errors: number }> {
  const dueRows = await db
    .select()
    .from(calendarFeedConfigs)
    .where(
      and(
        isNull(calendarFeedConfigs.deletedAt),
        sql`(${calendarFeedConfigs.lastSyncedAt} IS NULL
             OR ${calendarFeedConfigs.lastSyncedAt} + (${calendarFeedConfigs.syncCadenceMin}::int * INTERVAL '1 minute') <= NOW())`,
      ),
    );

  let errors = 0;
  for (const config of dueRows) {
    try {
      const result = await syncFeed(config);
      if (!result.success) errors += 1;
    } catch (err) {
      errors += 1;
      console.error(
        `syncFeed crashed for config=${config.id}:`,
        err instanceof Error ? `${err.name}: ${err.message}` : err,
      );
    }
  }

  return { syncedFeeds: dueRows.length, errors };
}

// Suppress unused-import warning if `gt` ever becomes unused after refactor.
void gt;

/**
 * M20 sync-before-plan: refresh THIS user's feeds whose `last_synced_at`
 * is null or older than `maxAgeMin`. Bounded + throttled so opening a
 * plan/Today page is calendar-correct without re-fetching on every load.
 * External calendar events take hard precedence over Priority scheduling,
 * so plan pages call this before computing queue/conflict context.
 * Best-effort: a feed fetch failure is logged, never thrown.
 */
export async function syncDueFeedsForUser(
  userId: string,
  maxAgeMin = 5,
): Promise<{ syncedFeeds: number; errors: number }> {
  const dueRows = await db
    .select()
    .from(calendarFeedConfigs)
    .where(
      and(
        eq(calendarFeedConfigs.userId, userId),
        isNull(calendarFeedConfigs.deletedAt),
        sql`(${calendarFeedConfigs.lastSyncedAt} IS NULL
             OR ${calendarFeedConfigs.lastSyncedAt} + (${maxAgeMin}::int * INTERVAL '1 minute') <= NOW())`,
      ),
    );

  let errors = 0;
  for (const config of dueRows) {
    try {
      const result = await syncFeed(config);
      if (!result.success) errors += 1;
    } catch (err) {
      errors += 1;
      console.error(
        `syncDueFeedsForUser: syncFeed crashed for config=${config.id}:`,
        err instanceof Error ? `${err.name}: ${err.message}` : err,
      );
    }
  }
  return { syncedFeeds: dueRows.length, errors };
}
