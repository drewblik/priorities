# Priorities — Technical Design Document

> How Priorities is built. Authoritative for technical decisions: stack, schema, prompts, code patterns, build order, acceptance criteria. Claude Code reads this end-to-end.

## Build Approach

**Recommended workflow** (matches the project owner's "Claude Code on phone while walking" loop):

1. The owner uses Claude Code on the web (claude.ai/code) from any device, primarily a phone. Claude Code runs in Anthropic-managed cloud sandboxes connected to a GitHub repo.
2. The repo is connected to Vercel for auto-deploy. Every push to any branch produces a preview URL; pushes to `main` deploy to production.
3. The dev loop: owner asks Claude Code to make a change → Claude Code commits/pushes → Vercel auto-deploys → owner opens preview URL on phone → tests → reports back to Claude Code.
4. **Always start with plan mode** on first handoff and on any complex change. Non-negotiable: the plan surfaces misreads cheaply before any code is written. The owner reviews the plan and approves before code lands.
5. Branch strategy: direct-to-`main` for solo iteration is fine. Use feature branches when a change feels risky or affects the data model.
6. The owner does not have a desktop dev environment installed. Everything happens via Claude Code's web/cloud sandboxes. Keep the build phone-friendly.

**Living project status doc.** A `PROJECT-STATUS.md` file lives at the repo root and is the single source of truth for "where are we." Claude Code MUST update this file every time a meaningful change is made — milestone progress, an item resolved, a new known issue, a phase transition. The format and initial content are in `priorities-project-status.md`; copy into the repo as `PROJECT-STATUS.md` during milestone 1.

**What to build first**: get a deployable skeleton up (project scaffolded, deploys to Vercel, database connected, auth working) before touching any AI or agent code. The first end-to-end milestone is a working manual council manager (Priority CRUD with drag-to-reorder). AI features layer on top. The Onboarding Coach lands later. Concrete milestone list in Build Order Recommendation below.

**Plan-mode handoff prompt (for the owner to give Claude Code on initial handoff)**:

> "I'm handing off the Technical Design Document for a personal life-management platform called Priorities. Read it end-to-end, then enter plan mode and propose the build order. The TDD already specifies a recommended build order — verify yours matches it or explain any deviation. Do not write any code until I approve the plan. The FDD is supporting context for product/UX decisions when the TDD doesn't specify literally; only refer to the FDD if the TDD is ambiguous. As part of the build, copy `priorities-project-status.md` into the repo root as `PROJECT-STATUS.md` and update it after every meaningful change going forward — milestone progress, items resolved, new known issues, phase transitions."

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server components for queries; client components for chat / drag-and-drop / calendar interactions |
| Hosting | Vercel | Hobby tier; preview URLs per branch |
| Database | Neon Postgres | Free tier; serverless connection pooling |
| ORM | Drizzle | Type-safe, lightweight |
| Auth | Lucia | Magic-link only (no passwords) |
| UI | Tailwind v4 + shadcn/ui | Mobile-first; dark mode optional |
| Drag-and-drop | @dnd-kit/core | Council reordering; modern, mobile-friendly |
| LLM | @anthropic-ai/sdk | Direct from API; per-user API keys |
| Validation | Zod | Type-safe schema validation for API inputs and LLM outputs |
| Markdown rendering | `react-markdown` + `rehype-sanitize` | Safe rendering; prevents XSS |
| Timezone handling | `date-fns-tz` | Consistent timezone math |
| Calendar parsing | `ical.js` | .ics feed parsing |
| PWA | `next-pwa` | Service worker, manifest, install prompt |
| File storage | Vercel Blob (or Neon if small files only) | For PriorityFile attachments |
| Email delivery | Resend | For magic link emails. Free tier (3K emails/month) sufficient for personal use. |

Package list (initial install via Claude Code):
```
next@latest
react@latest
@anthropic-ai/sdk@latest
drizzle-orm@latest
@neondatabase/serverless@latest
lucia@latest
@lucia-auth/adapter-postgresql@latest
@dnd-kit/core@latest
@dnd-kit/sortable@latest
zod@latest
resend@latest
ical.js@latest
react-markdown@latest
rehype-sanitize@latest
date-fns-tz@latest
date-fns@latest
next-pwa@latest
tailwindcss@latest
```

## Data Model

Full schema. All tables use `id` as a `text` primary key generated as `'<prefix>_' + nanoid(16)` for human-readable IDs (`pri_abc123...`, `task_def456...`). Timestamps are `timestamptz`. All tables include `created_at` and `updated_at` unless noted.

### Schema Conventions (apply to all user-content tables)

- **Soft delete**: tables `priorities`, `priority_memory`, `priority_files`, `tasks`, `events`, `quarters`, `chat_sessions` all include a `deleted_at timestamptz` column (default null). When a user "deletes" an item, set `deleted_at = now()` instead of issuing a `DELETE`. All read queries filter `WHERE deleted_at IS NULL`. Hard delete is reserved for `users` (full account deletion via export-then-purge flow) and `chat_messages` and `calendar_feed_events` (purged periodically).
- **Recurrence shape**: Tasks and Events both have an optional `recurrence jsonb` field. v1 supports daily, weekly (with byday), monthly (with bymonthday). Yearly deferred.

```typescript
type Recurrence = {
  type: 'daily' | 'weekly' | 'monthly';
  interval: number;                          // every N days/weeks/months (default 1)
  byday?: ('MO'|'TU'|'WE'|'TH'|'FR'|'SA'|'SU')[];  // for weekly only
  bymonthday?: number;                       // for monthly only (1-31)
  until?: string;                            // ISO date; null means forever
};
```

- **Concurrency control**: a `generation_locks` table provides single-flight protection for planning operations (see schema below).
- **Color/icon**: each Priority has an icon represented as `{ color: string (hex), style: string (one of 'classic'|'rounded'|'serif'|'script') }`. Stored as jsonb.

### users

```sql
CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text,
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_users_email ON users (email);
```

### sessions (Lucia)

```sql
CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
```

### user_settings

```sql
CREATE TABLE user_settings (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  anthropic_api_key text,                       -- encrypted at rest via app-level encryption
  daily_cost_cap_usd numeric(10,2) NOT NULL DEFAULT 5.00,
  monthly_cost_cap_usd numeric(10,2) NOT NULL DEFAULT 50.00,
  planning_day_of_week int NOT NULL DEFAULT 0,  -- 0=Sunday
  evening_review_time time NOT NULL DEFAULT '20:00:00',
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### priorities

```sql
CREATE TABLE priorities (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon jsonb NOT NULL DEFAULT '{"color":"#3b82f6","style":"classic"}',
  smart_goal text,
  quarterly_strategy text,
  weekly_strategy text,
  daily_strategy text,
  min_minutes_per_week int NOT NULL DEFAULT 0,
  max_minutes_per_week int NOT NULL DEFAULT 0,
  check_in_cadence text[] NOT NULL DEFAULT '{quarterly,weekly,daily}',  -- subset
  status text NOT NULL DEFAULT 'active',        -- active|paused|archived
  position int NOT NULL,
  pinned_summary text,
  sub_app_url text,                             -- POST-V1 (nullable, no UI in v1)
  sub_app_auth_token_encrypted text,            -- POST-V1 (nullable, no UI in v1)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_priorities_user_position ON priorities (user_id, position) WHERE deleted_at IS NULL;
CREATE INDEX idx_priorities_user_status ON priorities (user_id, status) WHERE deleted_at IS NULL;
```

### priority_memory

```sql
CREATE TABLE priority_memory (
  id text PRIMARY KEY,
  priority_id text NOT NULL REFERENCES priorities(id) ON DELETE CASCADE,
  body text NOT NULL,                           -- markdown
  tags text[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'user',          -- user|chatbot|onboarding|master_chat
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_priority_memory_priority ON priority_memory (priority_id, created_at DESC) WHERE deleted_at IS NULL;
```

### priority_files

```sql
CREATE TABLE priority_files (
  id text PRIMARY KEY,
  priority_id text NOT NULL REFERENCES priorities(id) ON DELETE CASCADE,
  filename text NOT NULL,
  blob_url text NOT NULL,
  mime_type text NOT NULL,
  size_bytes int NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_priority_files_priority ON priority_files (priority_id) WHERE deleted_at IS NULL;
```

### quarters

```sql
CREATE TABLE quarters (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quarter_label text NOT NULL,                  -- e.g., "Q1 2026"
  start_date date NOT NULL,
  end_date date NOT NULL,                       -- always start + 13 weeks - 1 day, or end of calendar quarter for partial first quarter
  status text NOT NULL DEFAULT 'active',        -- active|closed
  is_partial boolean NOT NULL DEFAULT false,    -- true for first quarter on signup if mid-calendar-quarter
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX idx_quarters_user_active ON quarters (user_id) WHERE status = 'active' AND deleted_at IS NULL;
CREATE INDEX idx_quarters_user_dates ON quarters (user_id, start_date) WHERE deleted_at IS NULL;
```

### quarter_week_focus

```sql
CREATE TABLE quarter_week_focus (
  id text PRIMARY KEY,
  quarter_id text NOT NULL REFERENCES quarters(id) ON DELETE CASCADE,
  priority_id text NOT NULL REFERENCES priorities(id) ON DELETE CASCADE,
  week_number int NOT NULL,                     -- 1-13 (or 1-N for partial first quarter)
  focus_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_qwf_unique ON quarter_week_focus (quarter_id, priority_id, week_number);
CREATE INDEX idx_qwf_quarter_week ON quarter_week_focus (quarter_id, week_number);
```

### tasks

```sql
CREATE TABLE tasks (
  id text PRIMARY KEY,
  owner_priority_id text NOT NULL REFERENCES priorities(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  target_date date,                              -- nullable: unscheduled. For recurring templates, this is the start date.
  time_block_start timestamptz,                  -- nullable: not time-blocked
  time_block_end timestamptz,                    -- nullable
  recurrence jsonb,                              -- nullable. If set, this is a recurring template.
  instance_of_task_id text REFERENCES tasks(id) ON DELETE CASCADE,  -- nullable. Set if this row is an override of a recurring template's instance.
  status text NOT NULL DEFAULT 'open',           -- open|done|skipped
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_tasks_user_target ON tasks (user_id, target_date) WHERE deleted_at IS NULL AND status = 'open';
CREATE INDEX idx_tasks_priority_status ON tasks (owner_priority_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_time_block ON tasks (user_id, time_block_start) WHERE deleted_at IS NULL AND time_block_start IS NOT NULL;
CREATE INDEX idx_tasks_recurrence ON tasks (user_id) WHERE recurrence IS NOT NULL AND instance_of_task_id IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_tasks_instance_of ON tasks (instance_of_task_id, target_date) WHERE instance_of_task_id IS NOT NULL AND deleted_at IS NULL;
```

### events

```sql
CREATE TABLE events (
  id text PRIMARY KEY,
  owner_priority_id text NOT NULL REFERENCES priorities(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  start_time timestamptz NOT NULL,               -- For recurring templates, this is the first occurrence's start
  end_time timestamptz NOT NULL,
  recurrence jsonb,                              -- nullable. If set, this is a recurring template.
  instance_of_event_id text REFERENCES events(id) ON DELETE CASCADE,  -- nullable. Set if this row is an override of a recurring template's instance.
  completion_status text,                        -- nullable: optional check-off (attended/missed)
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_events_user_start ON events (user_id, start_time) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_priority ON events (owner_priority_id, start_time) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_recurrence ON events (user_id) WHERE recurrence IS NOT NULL AND instance_of_event_id IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_events_instance_of ON events (instance_of_event_id, start_time) WHERE instance_of_event_id IS NOT NULL AND deleted_at IS NULL;
```

### calendar_feed_configs

```sql
CREATE TABLE calendar_feed_configs (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source text NOT NULL,                          -- google|outlook|other
  name text NOT NULL,                            -- user-provided friendly name
  feed_url text NOT NULL,
  sync_cadence_min int NOT NULL DEFAULT 30,
  last_synced_at timestamptz,
  last_sync_error text,                          -- nullable
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_calendar_configs_user ON calendar_feed_configs (user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_calendar_configs_due ON calendar_feed_configs (last_synced_at) WHERE deleted_at IS NULL;
```

### calendar_feed_events

```sql
CREATE TABLE calendar_feed_events (
  id text PRIMARY KEY,
  source_feed_id text NOT NULL REFERENCES calendar_feed_configs(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_id text NOT NULL,                     -- UID from .ics
  title text NOT NULL,
  description text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  removed_from_source_at timestamptz             -- nullable: set when source feed no longer includes this event AND it's a past event (preserved for history)
);

CREATE UNIQUE INDEX idx_cfe_unique ON calendar_feed_events (source_feed_id, external_id);
CREATE INDEX idx_cfe_user_start ON calendar_feed_events (user_id, start_time);
CREATE INDEX idx_cfe_user_active ON calendar_feed_events (user_id, start_time) WHERE removed_from_source_at IS NULL;
```

### chat_sessions

```sql
CREATE TABLE chat_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_type text NOT NULL,                    -- onboarding|creation|quarter|weekly|daily|master
  context_ref text,                              -- quarter_id / week_start_date / day_date / new_priority_id
  priority_id text REFERENCES priorities(id),    -- nullable: planning sessions populate this
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  total_cost_usd numeric(10,4) NOT NULL DEFAULT 0,
  deleted_at timestamptz
);

CREATE INDEX idx_chat_sessions_user_type ON chat_sessions (user_id, session_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_chat_sessions_planning ON chat_sessions (user_id, session_type, context_ref, priority_id) WHERE deleted_at IS NULL;
```

### chat_messages

```sql
CREATE TABLE chat_messages (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL,                            -- user|assistant|system
  content text NOT NULL,                         -- assistant content may include tool_use blocks as text
  tool_calls jsonb,                              -- structured tool calls extracted from content
  cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  is_complete boolean NOT NULL DEFAULT true,     -- false for interrupted streams
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_session ON chat_messages (session_id, created_at);
```

### generation_locks

Single-flight protection for planning operations. Prevents two concurrent planning generations from racing.

```sql
CREATE TABLE generation_locks (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lock_key text NOT NULL,                        -- e.g., 'plan:quarter:Q1-2026', 'plan:week:2026-05-04', 'plan:day:2026-05-04', 'master_chat'
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, lock_key)
);

CREATE INDEX idx_generation_locks_expires ON generation_locks (expires_at);
```

Acquisition: `INSERT ... ON CONFLICT (user_id, lock_key) DO NOTHING RETURNING *`. If insert succeeds, caller owns the lock. If conflict and existing lock is past expires_at, treat as stale and overwrite. Release on completion (success or error). 90-second default TTL.

## UI Structure

Routes (Next.js App Router):

```
/                                  → redirect to /day/today (or /onboarding if first-run)
/signin                            → magic link request page
/auth/callback                     → magic link verification
/onboarding                        → Coach welcome
/onboarding/chat                   → Coach interview chat
/onboarding/proposal               → Council Proposal Review
/priorities                        → Council Home (Priorities List)
/priorities/new                    → Priority Creation Chat
/priorities/[id]                   → Priority Detail / Edit
/plan/quarter                      → Quarter Plan
/plan/quarter/[quarterId]          → Quarter Plan for specific quarter (re-plan)
/plan/week                         → Weekly Plan
/plan/week/[weekStartDate]         → Weekly Plan for specific week (re-plan)
/plan/day                          → Daily Plan (tomorrow by default)
/plan/day/[date]                   → Daily Plan for specific date
/day/[date]                        → Daily View (today by default; date as YYYY-MM-DD or "today")
/chat                              → Master Chat full-page (mobile preferred is overlay; this is fallback)
/settings                          → Settings tabs (default tab: Profile)
/settings/[tab]                    → Settings sub-page (profile|api-key|calendar|planning|data)
```

API routes:

```
/api/auth/magic-link               POST: send magic link email
/api/auth/callback                 GET: verify magic link, create session
/api/auth/signout                  POST

/api/priorities                    GET (list), POST (create)
/api/priorities/[id]               GET, PATCH, DELETE (soft)
/api/priorities/reorder            POST: batch update positions
/api/priorities/[id]/memory        POST (add entry)
/api/priorities/[id]/memory/[mid]  PATCH, DELETE (soft)
/api/priorities/[id]/files         POST (upload), GET (list)
/api/priorities/[id]/files/[fid]   DELETE

/api/quarters/current              GET: returns current quarter
/api/quarters/[id]                 GET, PATCH

/api/plan/quarter                  POST: start/resume quarter planning session
/api/plan/quarter/chat             POST: send message in current quarter planning session (streaming)
/api/plan/week                     POST: start/resume weekly
/api/plan/week/chat                POST: streaming
/api/plan/day                      POST: start/resume daily
/api/plan/day/chat                 POST: streaming
/api/plan/[horizon]/finish         POST: mark current Priority done in queue, advance
/api/plan/[horizon]/skip           POST: skip current Priority

/api/onboarding/start              POST: create onboarding session
/api/onboarding/chat               POST: streaming
/api/onboarding/proposal           POST: generate council proposal from interview
/api/onboarding/accept             POST: create all Priorities from accepted proposal

/api/chat/master                   POST: send message + screen context, get preview (non-streaming for preview structure)
/api/chat/master/confirm           POST: execute confirmed actions
/api/chat/master/cancel            POST: discard pending preview

/api/tasks                         GET, POST
/api/tasks/[id]                    PATCH, DELETE (soft)
/api/tasks/[id]/complete           POST

/api/events                        GET, POST
/api/events/[id]                   PATCH, DELETE (soft)

/api/calendar-feeds                GET, POST
/api/calendar-feeds/[id]           PATCH, DELETE (soft)
/api/calendar-feeds/sync           POST: cron-triggered (or manual)

/api/settings                      GET, PATCH
/api/export                        GET: JSON export of all user data
```

## Subsystems

### Subsystem 1: Council Management

CRUD on Priorities, drag-to-reorder, pause/archive.

**Drag-to-reorder** uses `@dnd-kit/sortable`. UX pattern: optimistic update on the client (the Priority card visually moves immediately on drop). Client sends `POST /api/priorities/reorder` with the new ordering as `[{ id, position }]`. Server updates positions in a single transaction. On server failure, client reverts to pre-drop ordering and surfaces a toast notification ("Couldn't save the new order, try again"). On success, no UI change needed (the optimistic state was already correct).

**File uploads to PriorityFile** have these v1 constraints:
- Maximum size: 10MB per file
- Allowed MIME types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`, `text/plain`, `text/markdown`, `text/csv`, `application/json`
- Files outside these constraints are rejected with a clear error message at upload time
- Total storage per user is not capped in v1 (single-user assumption); add cap if multi-user
- No virus scanning in v1 (single-user assumption)

Pause sets `status='paused'`. Archive sets `status='archived'`. Both keep the row in the database. Pause shows the Priority in the main list with a paused badge; archive hides from main list (visible via "Show archived" toggle). Both exclude from planning queues. Active is the default status.

**Priority deletion (soft-delete via `deleted_at`) cascades selectively to owned items**:

| Item | Cascade behavior on Priority soft-delete |
|---|---|
| Past completed Tasks/Events (`completed_at IS NOT NULL` AND `target_date < today` or `start_time < now()`) | **Preserved.** Continue to render in past Daily Views with a "from deleted Priority" indicator (gray badge with the Priority's old name, surfaced from the soft-deleted row). |
| All other Tasks/Events (open, future, or past-but-incomplete) | Soft-deleted. |
| PriorityMemory entries | Soft-deleted (private to the Priority). |
| PriorityFiles | Soft-deleted. Blob storage cleaned by background sweep (deferred to v1.1; v1 just leaves blobs orphaned in storage). |
| QuarterWeekFocus rows | Soft-deleted (focus labels for a deleted Priority are meaningless). |
| ChatSessions and ChatMessages for this Priority | **Preserved.** Chat history is valuable for the user's record. |
| Recurring Task/Event templates owned by this Priority | Soft-deleted along with the Priority. Cascade rule on `instance_of_task_id` then soft-deletes any overrides too. |

**Implementation pattern**:

```typescript
async function softDeletePriority(priorityId: string, userId: string) {
  await db.transaction(async (tx) => {
    const now = new Date();
    const today = formatInTimeZone(now, userTimezone, 'yyyy-MM-dd');
    
    // Soft-delete the priority itself
    await tx.update(priorities).set({ deleted_at: now }).where(eq(priorities.id, priorityId));
    
    // Soft-delete tasks: all that are NOT (completed AND past-dated)
    await tx.update(tasks).set({ deleted_at: now }).where(and(
      eq(tasks.owner_priority_id, priorityId),
      isNull(tasks.deleted_at),
      not(and(
        isNotNull(tasks.completed_at),
        or(
          and(isNotNull(tasks.target_date), lt(tasks.target_date, today)),
          and(isNotNull(tasks.time_block_end), lt(tasks.time_block_end, now))
        )
      ))
    ));
    
    // Same logic for events (using start_time < now as past-check)
    // Soft-delete priority_memory, priority_files, quarter_week_focus
    // Leave chat_sessions and chat_messages alone
  });
}
```

**Restore via export**: a soft-deleted Priority and all its cascaded items can be recovered from the data export (which includes deleted rows). v1 has no in-app restore UI; that's a v1.1 trash recovery feature.

**Pause vs Archive vs Delete summary**:
- **Pause**: keeps everything intact. Excluded from planning queues. Visible in main list with badge.
- **Archive**: same as pause but hidden from main list (visible via toggle).
- **Delete**: cascades selectively as above. Soft-delete only — recoverable via export. Confirmation modal required.

### Subsystem 2: Onboarding Coach

Special chatbot with hardcoded system prompt (see Verbatim Prompts). Walks user through 7-topic interview: Work, Health, Relationships, Hobbies, Finances, Ambitions, Recent life events.

Implementation:
- Session is created on first visit to `/onboarding` (idempotent)
- Each user message → streamed Anthropic call with full session history + system prompt
- Coach is responsible for tracking which topics have been covered (via assistant text marking transitions)
- "Resume" works automatically because session state is in `chat_messages`

After interview ends (user clicks "I'm done" or Coach detects completion):
- Non-streaming Sonnet call with all interview messages + structured output prompt
- Returns `Council Proposal` JSON: list of 5-10 proposed Priorities with name, suggested icon, smart_goal draft, quarterly/weekly/daily strategy drafts, min/max minutes/week suggestion, suggested cadence, pre-populated memory entries (extracted from interview content)
- Frontend renders Council Proposal Review with per-card edit affordances
- On accept: `POST /api/onboarding/accept` creates all Priorities + memory entries in a single transaction

**Re-triggerable from Settings**: users who skipped the interview on signup (or want to redo it) can launch a new Onboarding Coach session from Settings → "Restart Onboarding Interview." This creates a fresh ChatSession with `session_type='onboarding'` (the previous one stays in history with its `closed_at` set).

When the new interview produces a Council Proposal and the user accepts, present a choice modal:
- **Replace current council**: cascade-soft-deletes all existing Priorities (per Subsystem 1's selective cascade rules) before creating the new ones. Confirmation modal warns about what's preserved (past completed Tasks/Events stay; everything else is removed).
- **Add to current council**: appends the new Priorities to the existing council. New Priorities get positions after the existing ones. Each new Priority triggers Mid-cycle Priority Onboarding (Subsystem 11) banners.

The "Replace" option is offered explicitly (not the default) and requires typing "REPLACE" in the confirmation field — destructive operations require deliberate effort.

### Subsystem 3: Priority Creation (manual)

Similar pattern to Onboarding Coach but scoped to one Priority. Hardcoded system prompt walks through 8 fields: Name → Icon → SMART Goal → Quarterly Strategy → Weekly Strategy → Daily Strategy → Min/Max Minutes per Week → Check-in Cadence.

Implementation:
- Session created on visit to `/priorities/new` (one new draft Priority created with empty fields)
- Streaming chat
- After each user response, the chatbot uses tool calls to update the corresponding draft Priority field
- When complete (all required fields filled), redirect to Priority Detail in edit mode for final review

### Subsystem 4: Three Planning Sessions (Q/W/D)

All three share the same UI shape (queue + chat + calendar) but render different calendar surfaces.

Shared `PlanningSession` React component handles:
- Queue display (priorities ordered, current highlighted, completed checked, skipped grayed)
- Chat panel for current Priority
- Calendar surface (horizon-specific child component: `QuarterCalendar`, `WeekCalendar`, `DayCalendar`)
- Action buttons (Next Priority, Skip, Replan This One, End Session)

**Session lifecycle:**

1. User triggers planning → `POST /api/plan/[horizon]` with optional `quarter_id` / `week_start_date` / `day_date`
2. Server checks: does a session for this (horizon, context_ref) already exist? 
   - If no: create N sessions (one per active Priority that participates in this horizon), all marked open
   - If yes (mid-session resume): return current state (which Priorities done, which current)
   - If yes and complete (re-planning trigger): return mode picker payload
3. Mode picker (re-plan only): "Replan all" deletes existing sessions and recreates; "Adjust" lets user tap a specific Priority to redo just that one
4. Client renders queue, makes the first/current Priority the active one, opens its chat
5. User chats with current Priority; streaming responses
6. User taps "Next Priority": current session marked closed, advance to next open session in queue
7. When all sessions closed: planning complete; redirect to Daily View (or Priorities List for quarter)

**Calendar surfaces during planning:**
- `QuarterCalendar`: 13-row grid (rows = weeks). Cells colored by Priority based on `quarter_week_focus` rows. Each row tappable in "Adjust" mode.
- `WeekCalendar`: Mon-Sun day columns. Tasks/Events for each day rendered as colored stacked items. Day columns tappable in "Adjust" mode.
- `DayCalendar`: hourly timeline (default 6am-midnight, scrollable to early/late hours). Time blocks rendered as colored bars. Calendar feed events rendered as immutable gray bars. Conflicts visualized.

**Conflict resolution during planning:**
- When a Priority's chatbot proposes a Task/Event, server validates against already-claimed time
- For weekly: check if proposed day already has too many tasks (subjective; chatbot is informed of current load via context)
- For daily: check if proposed time block overlaps existing time block from earlier-priority Priority OR calendar feed event
- If conflict: return error to chatbot in next turn ("Tuesday 6-7pm is taken by Work; pick a different time"); chatbot adjusts and re-proposes
- Frontend displays conflict notes inline as system messages in the chat

**Tool execution error handling:**

Each tool call from a planning chatbot is a discrete write to the database. The model emits a `tool_use` block in its streaming response; the server intercepts, executes the corresponding DB operation in a transaction, then continues the stream by injecting a `tool_result` back to the model.

Three failure modes:

1. **Validation failure** (model proposed something invalid — target_date in past, time block end before start, Priority that doesn't exist). Server returns `tool_result` with `is_error: true` and the validation message. Chatbot sees this in next turn and self-corrects ("Sorry, let me try again with a valid date"). User sees both the rejected attempt and the recovery in chat history.

2. **Concurrency failure** (underlying entity was modified or soft-deleted between read and write — user deleted the Priority in another tab mid-session). Server returns `tool_result` with `is_error: true` and "this entity no longer exists or has changed; please re-check current state." Chatbot can call read tools to refresh and try again.

3. **Transient infrastructure failure** (DB connection error, Neon timeout). Retry the operation once with exponential backoff (250ms then 1s). If still failing: return `tool_result` with `is_error: true` and a "transient error, please try again" message. Chatbot can retry or apologize and move on.

**No automatic rollback of prior successful tool calls.** If a chatbot has already created 3 tasks successfully and the 4th fails, the 3 stay. Matches user expectation (you don't lose work because of a transient blip). User can always undo specific items via Daily View or master chat.

**Frontend rendering**: tool errors render inline in chat as system-style messages with red accent ("⚠ Couldn't create that task: target date can't be in the past"). The chat continues; user sees what was proposed and what failed.

**Available read tools for chatbot recovery**: `read_priority(id)`, `read_tasks_for_date(date)`, `read_quarter_week_focus(quarter_id)`, `read_events_for_date_range(start, end)`. These let the chatbot re-anchor to current state when something feels off.

### Subsystem 5: Master Chat

Always-available router. Distinct lifecycle from streaming planning chats — uses non-streaming structured output for preview generation.

**Flow:**
1. User opens master chat from any page → frontend captures Screen Context envelope:

```typescript
type ScreenContext = {
  page: string;                                // e.g., '/plan/week/2026-05-04'
  horizon?: 'quarter' | 'week' | 'day';
  current_quarter_id?: string;
  current_week_start_date?: string;
  current_day_date?: string;
  current_priority_id?: string;                // if in a planning session
  visible_items?: { kind: 'task'|'event'|'calendar_feed_event', id: string, title: string }[];
  selected_item?: { kind: string, id: string };
};
```

2. User types message → `POST /api/chat/master` with `{ message, screen_context }`
3. Server:
   - Loads master ChatSession (one per user) and its message history
   - Loads council (all active Priorities with names, icons, brief summaries)
   - Constructs prompt with: master chat system prompt, council, screen context, message history, new user message
   - Calls Anthropic with structured output schema for `MasterChatResponse`:

```typescript
type MasterChatResponse = {
  understanding: string;                       // free-form text — what the LLM thinks the user wants
  affected_priorities: { id: string, reasoning: string }[];
  proposed_actions: ProposedAction[];
  preview_summary: string;                     // human-readable summary for the preview card
  needs_clarification?: string;                // nullable — if model isn't sure, ask user instead of acting
};

type ProposedAction =
  | { type: 'add_priority_memory', priority_id: string, body: string, tags: string[] }
  | { type: 'create_task', owner_priority_id: string, title: string, target_date?: string, time_block_start?: string, time_block_end?: string }
  | { type: 'modify_task', task_id: string, changes: Partial<Task> }
  | { type: 'complete_task', task_id: string }
  | { type: 'create_event', owner_priority_id: string, title: string, start_time: string, end_time: string }
  | { type: 'modify_event', event_id: string, changes: Partial<Event> }
  | { type: 'reschedule_quarter_week_focus', quarter_id: string, priority_id: string, week_number: number, new_focus_label: string }
  | { type: 'update_priority_field', priority_id: string, field: string, value: any };
```

4. Server saves user message and assistant response to `chat_messages`. The assistant response includes the structured payload as JSON in `tool_calls`.
5. Frontend renders preview card: summary + list of affected actions + Confirm / Cancel / Edit buttons
6. On Confirm: `POST /api/chat/master/confirm` with the proposed actions (echo). Server executes each in a transaction. On success, returns updated state.
7. On Cancel: `POST /api/chat/master/cancel`. No state change; preview discarded; user can continue chatting.
8. If `needs_clarification` is set: render as a question in chat, no preview card; user replies normally.

**Preview staleness validation** — what happens between preview generation and confirm:

Each ProposedAction includes the IDs of entities it touches (task_id, event_id, priority_id, quarter_id, etc.). Before executing on confirm, the server validates each action atomically:

1. Existence check: all referenced entities still exist (not soft-deleted) — `SELECT id FROM tasks WHERE id IN (...) AND deleted_at IS NULL` for each affected table.
2. Applicability check: the proposed mutation is still valid given current state. Examples:
   - `complete_task` validates the task's status is still `open` (not already `done` or `skipped`)
   - `modify_task` with new time block validates no conflicting time block has emerged from another source
   - `add_priority_memory` validates the Priority isn't paused or archived
3. Conflict re-check: for time-bound proposals, validate that no new calendar feed event has synced into the proposed time slot since the preview was generated.

**If validation fails on any action**:
- Abort the entire batch (atomic — partial application would be confusing)
- Return error with details: which action failed, why
- Frontend renders a clear message: "Some of what we agreed on doesn't match the current state anymore. Send your message again to get a fresh preview."
- The pending preview is discarded; user re-engages with master chat freshly

**Preview lifecycle**:
- Pending previews older than 5 minutes are discarded by lazy cleanup (run on next master chat invocation, no separate cron).
- A user trying to confirm a >5-minute-old preview gets the same "expired, send again" message.
- The preview record itself (the LLM's structured response) lives in `chat_messages.tool_calls` — auditable in chat history but never re-applied.

**Rationale**: better to fail loudly than apply stale state silently. The user can always re-trigger; the LLM produces a fresh preview based on current state. Atomicity (all-or-nothing batch execution) ensures the user is never left with partial state matching neither the original preview nor the original world.

**Chat scrollback pagination**: master chat history grows unbounded over a user's lifetime. To avoid loading thousands of messages at chat open:
- Initial load: fetch the most recent 50 messages (one query, ordered by `created_at DESC`, limit 50, then reverse for display)
- "Load older" button at the top of scrollback: loads next 50 older messages, prepended to the view
- Server endpoint: `GET /api/chat/master/messages?before=<message_id>&limit=50`
- Same pattern applied to planning ChatSessions (less critical since planning sessions are typically shorter, but the same endpoint pattern works)

Frontend caches loaded pages in client state for the session; navigating away and returning re-loads from server.

### Subsystem 6: Calendar Feed Sync

Cron job runs every 5 minutes (Vercel Cron):

```typescript
// app/api/cron/calendar-sync/route.ts
export async function GET(req: Request) {
  // verify cron secret
  const dueFeedIds = await db
    .select({ id: calendar_feed_configs.id })
    .from(calendar_feed_configs)
    .where(and(
      isNull(calendar_feed_configs.deleted_at),
      sql`(${calendar_feed_configs.last_synced_at} IS NULL OR ${calendar_feed_configs.last_synced_at} + interval '1 minute' * ${calendar_feed_configs.sync_cadence_min} <= now())`
    ))
    .for('update', { skipLocked: true });   // Postgres row-level locking
  
  for (const { id } of dueFeedIds) {
    await syncFeed(id);
  }
}

async function syncFeed(configId: string) {
  // 1. Fetch .ics URL
  // 2. Parse via ical.js
  // 3. Upsert into calendar_feed_events keyed by (source_feed_id, external_id)
  // 4. Reconcile events removed from source (see below)
  // 5. Update calendar_feed_configs.last_synced_at and clear last_sync_error
}
```

**Reconciliation pattern for events removed from source** (events that exist in our DB but are not in the latest fetch):

```typescript
async function reconcileFeedEvents(configId: string, fetchedExternalIds: Set<string>) {
  const now = new Date();
  
  const missingEvents = await db.select().from(calendar_feed_events).where(and(
    eq(calendar_feed_events.source_feed_id, configId),
    notInArray(calendar_feed_events.external_id, [...fetchedExternalIds]),
    isNull(calendar_feed_events.removed_from_source_at)  // not already marked
  ));
  
  for (const event of missingEvents) {
    if (event.start_time > now) {
      // Future event removed from source = cancellation. Hard-delete.
      await db.delete(calendar_feed_events).where(eq(calendar_feed_events.id, event.id));
    } else {
      // Past event removed from source = preserve with badge for historical record.
      await db.update(calendar_feed_events).set({ 
        removed_from_source_at: now 
      }).where(eq(calendar_feed_events.id, event.id));
    }
  }
}
```

**Frontend rendering**:
- Events with `removed_from_source_at IS NULL` render normally
- Past events with `removed_from_source_at IS NOT NULL` render with a "removed from source" badge or italic styling (e.g., "Dentist appointment ⓧ removed from calendar")
- Read queries for "current and future events" filter `WHERE removed_from_source_at IS NULL` (use `idx_cfe_user_active` index)
- Read queries for "past events including history" don't filter on `removed_from_source_at` and surface the badge in UI

**Edge case — event re-appears in source after being marked removed**: re-create as fresh row (the upsert by (source_feed_id, external_id) will catch the existing soft-marked row and update it, clearing `removed_from_source_at`). Add this to the upsert logic:

```typescript
// On upsert: if existing row has removed_from_source_at set, clear it (event is back)
ON CONFLICT (source_feed_id, external_id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  last_synced_at = EXCLUDED.last_synced_at,
  removed_from_source_at = NULL;  -- explicitly clear
```

External event timezone: ical.js respects `VTIMEZONE` blocks. Always store as UTC.

### Subsystem 7: Auth (Lucia magic link)

Standard Lucia magic link setup:
1. User enters email on `/signin` → `POST /api/auth/magic-link`
2. Server generates token (16 bytes, URL-safe base64 encoded), stores in `magic_link_tokens` table with `email`, `token_hash` (SHA-256 of token), `expires_at` (now + 15 min), `used_at` (null), and sends email via Resend with link `https://yourapp.vercel.app/auth/callback?token=...`
3. User taps link → `GET /auth/callback`:
   - Look up token by hash; verify not expired and not yet used
   - If invalid/expired/used: render error page ("This link is invalid or has expired. Request a new one.")
   - If valid: mark `used_at = now()` (single-use enforcement), find or create user by email, create Lucia session, set session cookie
   - Redirect: `/onboarding` for first-time user, `/day/today` for returning user
4. Session cookie persists 30 days; protected routes check via Lucia middleware

**magic_link_tokens schema**:

```sql
CREATE TABLE magic_link_tokens (
  id text PRIMARY KEY,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_magic_link_tokens_email ON magic_link_tokens (email, expires_at);
```

**Replay protection**: `used_at` flips on first successful verification. Subsequent requests with the same token (whether from the same browser or shared by accident) see `used_at IS NOT NULL` and are rejected. Combined with the 15-minute TTL and single-use, this prevents:
- Link interception + replay (used_at protects)
- Forgotten link being used later (TTL protects)
- Same link being used from two devices (used_at protects)

**Cleanup**: expired and used tokens older than 24 hours are pruned by lazy cleanup query (run on next signin attempt). No separate cron needed.

**Email delivery via Resend**:
- API key in `RESEND_API_KEY` env var (Vercel)
- Verified sending domain (e.g., `auth@priorities.app` once domain is set up; before then, use Resend's onboarding domain)
- Plain-text email body with the magic link, simple subject ("Sign in to Priorities")
- Free tier: 3K emails/month, 100/day — vastly sufficient for personal use; upgrade if multi-user
- Failures (Resend down, rate limit, invalid email format): return error to user with friendly message, log details

### Subsystem 8: PWA

`next-pwa` with manifest:

```json
{
  "name": "Priorities",
  "short_name": "Priorities",
  "description": "Your priorities, planned by their advocates.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Service worker caches static assets. API requests pass through (no offline writes).

### Subsystem 9: Priority Memory Management

Priority memory grows over time as the chatbot writes entries during planning sessions and master chat. Without a pruning strategy, older entries become invisible (chatbots only see most recent 10 + pinned summary) and the memory table grows unbounded.

**Soft cap**: 50 entries per Priority. When a Priority's `priority_memory` count exceeds 50 (excluding soft-deleted), an automated summarization process triggers:

1. Fetch all entries beyond the 10 most recent (oldest first)
2. Call Haiku with the memory summarization prompt (Prompt 8 below) — takes existing `pinned_summary` + the older entries; returns an updated `pinned_summary`
3. Soft-delete the older entries (still recoverable via data export; no longer surfaced to chatbots; not visible in Priority Detail's main memory list — accessible only via "View archived memory" toggle in Priority Detail)
4. Update `priority.pinned_summary` and `priority.updated_at` in a single transaction

**Triggers**:
- After any memory entry creation, if count > 50: enqueue summarization for background execution (non-blocking — user doesn't wait)
- On planning session start: if summarization is pending or count is significantly over (>60), run synchronously before the chatbot's first message so the chatbot sees a fresh summary
- Manual trigger: Priority Detail → "Compress memory" button (advanced action; surfaces summarization on demand)

**pinned_summary soft cap**: ~2000 tokens. If the summary approaches this cap during summarization, the prompt is instructed to "compress further while preserving the most important context — drop tactical details, keep enduring patterns and anchoring facts."

**Concurrency**: summarization uses a generation_lock with key `priority_memory_summarize:<priority_id>` to prevent two concurrent summarizations on the same Priority. TTL 30 seconds.

**Cost**: each summarization is one Haiku call. Typical cost ~$0.001-0.005 per run. Bounded by the trigger frequency (only when crossing the 50-entry threshold).

v1.1 candidate: RAG (vector embeddings + semantic search) for queries that need to reach archived history. Not in v1 — the summarization pattern keeps the most important enduring context in the pinned summary.

### Subsystem 10: Quarter Lifecycle

Quarters are calendar-aligned (Q1 = Jan-Mar, Q2 = Apr-Jun, etc.) and 13 weeks long, with the first quarter on signup possibly being partial. The system needs explicit logic for who creates quarters, when transitions happen, and how partial quarters are handled.

**Quarter creation rules:**
- **First quarter on signup**: created at first sign-in (or at end of Onboarding Coach acceptance, whichever comes first). `start_date` = today, `end_date` = last day of current calendar quarter, `is_partial` = true if today is not the first day of a calendar quarter.
- **Subsequent quarters**: created automatically on first user action after the previous quarter's `end_date`. Labels follow calendar quarters.

**Auto-transition logic** runs as middleware on any authenticated request:

```typescript
// middleware: ensureCurrentQuarter
async function ensureCurrentQuarter(userId: string, userTimezone: string): Promise<Quarter> {
  const todayInUserTz = formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd');
  const activeQuarter = await getActiveQuarter(userId);
  
  if (!activeQuarter) {
    // First quarter on signup
    return createPartialQuarterForToday(userId, todayInUserTz);
  }
  
  if (todayInUserTz > activeQuarter.end_date) {
    // Transition: close previous, create next
    await closeQuarter(activeQuarter.id);
    return createNextCalendarQuarter(userId, todayInUserTz);
  }
  
  return activeQuarter;
}
```

**Behavior**:
1. Active quarter loaded on every request (cheap — single indexed query)
2. If `today > end_date` in user's timezone, close previous and create new
3. New quarter starts empty (no QuarterWeekFocus rows yet)
4. Daily View, Priorities List, and quarter-aware pages display "Plan your new quarter (Q2 2026)" banner

**Why middleware not cron**: avoids needing a separate cron job, avoids timezone complexity of "when is the quarter over for this user." User's `users.timezone` is the reference; quarter rolls over on first action after their local midnight at calendar quarter boundary.

**Edge case — first action of new quarter is the planning trigger**: middleware creates the new empty quarter first; planning then starts on the empty quarter (no replan-mode picker since no plan exists yet).

**Manual quarter close** (Settings → "Start a new quarter early"): allows the user to bail on a quarter mid-way. Closes current with `status='closed'`, creates new with `start_date = today`, `end_date = end of current calendar quarter`, `is_partial = true`. This is for users whose quarter has gone off-rails and want a fresh start without waiting for the calendar boundary.

**Closed quarters remain accessible** — read-only — via Settings → "Past quarters" or via direct URL `/plan/quarter/[quarterId]`. Useful for retrospectives and for understanding what was planned vs what happened.

### Subsystem 11: Mid-cycle Priority Onboarding

When a new Priority is created mid-quarter (or mid-week, or mid-day), the council shouldn't ignore it until the next full cycle. Instead, the system surfaces an opt-in to give the new Priority a chance to participate in the current cycle.

**Trigger**: After Priority creation completes (whether via Onboarding Coach, manual Creation chatbot, or Council Proposal Review accept), check active planning cycles. For each cycle the new Priority would participate in (per its `check_in_cadence`), check whether that cycle is "in progress" — meaning the user has already done at least one planning session for that cycle since it started.

**Three banners (mutually exclusive — show only the most relevant)**:

1. **Quarter banner** (highest priority): "Want to plan [Priority Name]'s remaining [N] weeks of this quarter now?" Visible in Priorities List header. Actions: "Plan now" (opens Quarter Plan scoped to this single Priority for weeks current_week+1 through end_of_quarter), "Skip — wait for next quarter" (dismisses).
2. **Week banner**: "Want to plan [Priority Name] for this week?" Shown if quarter banner was dismissed/N/A and the current week is partly through. Actions: "Plan now" (opens Weekly Plan scoped to this single Priority for remaining days), "Skip" (dismisses).
3. **Day banner**: "Want to plan [Priority Name] for tomorrow?" Shown if both above dismissed/N/A and a daily plan exists for tomorrow already. Actions: "Plan now" (opens Daily Plan scoped to this single Priority), "Skip" (dismisses).

**Implementation**: each banner is a row in a transient `priority_onboarding_prompts` state (could be a session-storage value rather than a DB table since it's ephemeral, OR a `dismissed_at` flag if persistence across devices matters — recommend session storage for v1 simplicity, can add DB persistence later).

**Scoped planning UI**: when one of these banners launches a planning session for just one Priority, the queue at top shows only that single Priority (no need to walk through full council). After the session, the user returns to wherever they were.

**Implicit conflict**: a new Priority added late in a planning cycle that gets to opt in won't override already-claimed time from earlier-priority Priorities. This is fine — it slots into available time only, consistent with the council's order-as-conflict-resolution rule.

**If the user dismisses all three banners**: the new Priority stays out of current cycles. It will participate naturally in the next planning trigger for each horizon it's enrolled in.

### Subsystem 12: Recurrence Engine (template + override pattern)

Tasks and Events with `recurrence` set are **templates**. Each template represents a series of occurrences across time. Instances of a template are not stored as separate rows by default — they are computed on-demand at query time. When the user (or chatbot) interacts with a specific instance (checks it off, skips it, edits its time block), an **override row** is created with `instance_of_task_id` (or `instance_of_event_id`) pointing back to the template and `target_date` (or `start_time`) set to the specific date being overridden.

**Three row types** in `tasks` (and analogously in `events`):

1. **One-off task**: `recurrence = null`, `instance_of_task_id = null`. Standalone task with optional target_date.
2. **Recurring template**: `recurrence != null`, `instance_of_task_id = null`. The source of truth for the series. Its `target_date` is the START date of the recurrence pattern.
3. **Override instance**: `recurrence = null`, `instance_of_task_id != null`. Represents a specific date's instance that was modified, completed, or skipped.

**Read pattern — getTasksForDate**:

```typescript
async function getTasksForDate(userId: string, date: string): Promise<DisplayedTask[]> {
  // 1. Real tasks with target_date matching (covers one-offs and overrides)
  const realTasks = await db.select().from(tasks).where(and(
    eq(tasks.user_id, userId),
    eq(tasks.target_date, date),
    isNull(tasks.deleted_at)
  ));

  // 2. Recurring templates whose pattern includes this date
  const templates = await db.select().from(tasks).where(and(
    eq(tasks.user_id, userId),
    isNotNull(tasks.recurrence),
    isNull(tasks.instance_of_task_id),
    isNull(tasks.deleted_at)
  ));

  const overrideTaskIds = new Set(
    realTasks
      .filter(t => t.instance_of_task_id !== null)
      .map(t => `${t.instance_of_task_id}:${t.target_date}`)
  );

  const virtualInstances: DisplayedTask[] = [];
  for (const template of templates) {
    if (recurrenceIncludesDate(template.recurrence, template.target_date, date)) {
      const overrideKey = `${template.id}:${date}`;
      if (!overrideTaskIds.has(overrideKey)) {
        virtualInstances.push(materializeVirtualInstance(template, date));
      }
    }
  }

  return [...realTasks.filter(t => !t.instance_of_task_id || t.target_date === date), ...virtualInstances];
}
```

Virtual instances have a synthetic ID like `virt_<template_id>_<date>` for client-side reference but are not real DB rows. When the user acts on a virtual instance, the client sends the synthetic ID to the API; the API materializes a real override row at that point.

**Override creation triggers** (any of these creates an override Task row from a virtual instance):
- User checks off a virtual instance → override with `status='done'`, `completed_at=now()`
- User skips an instance → override with `status='skipped'`
- User edits an instance (e.g., changes time block for one day only) → override with the modifications
- Master chat or planning chatbot proposes a per-instance change → same pattern

**Template editing**:
- Editing the template directly affects all future virtual instances
- Existing overrides retain their override values (they're frozen at the time of override)
- v1.1 candidate: "apply changes to existing overrides too" option in edit UI

**Template deletion**:
- Soft-deleting a template cascade-soft-deletes all its overrides (via FK cascade on instance_of_task_id)
- Virtual instances naturally disappear from views (no template = no recurrence to expand)

**Recurrence pattern math** (`recurrenceIncludesDate`):

```typescript
function recurrenceIncludesDate(recurrence: Recurrence, startDate: string, queryDate: string): boolean {
  // queryDate before startDate: never
  // queryDate after recurrence.until (if set): never
  // type='daily': true if (queryDate - startDate) % interval === 0
  // type='weekly': true if same week-day AND (weeks since startDate) % interval === 0 AND queryDate.dayOfWeek in (recurrence.byday || [startDate.dayOfWeek])
  // type='monthly': true if queryDate.dayOfMonth === (recurrence.bymonthday || startDate.dayOfMonth) AND (months since startDate) % interval === 0
}
```

Use date-fns helpers (no external rrule lib needed for v1's limited patterns).

**Planning chatbot interaction with recurring items**:

- Weekly planning: chatbot sees real tasks for the week + virtual instances + existing overrides. Can propose creating overrides ("skip this week's gym session on Tuesday — back pain") which surface as override Task rows on confirm.
- Daily planning: chatbot sees instances/overrides for tomorrow. Can propose time-blocking a virtual instance (creates an override with time_block set), completing one (creates an override with status='done'), or skipping one.
- The chatbot's tool calls use the synthetic virtual ID; the server materializes the override on tool execution.

**Why this pattern**:
- Template stays the source of truth for "what's the routine"
- Each instance can independently track completion/modification without polluting the template
- No background job to materialize instances (would need to keep generating ahead, handle infinite recurrence, etc.)
- Read queries scale linearly with active templates × date range, which is small for personal use

**Acceptable v1 limitations**:
- No recurrence end-date enforcement at write time — `recurrence.until` is checked at read time only. (If a template's `until` has passed, it just stops generating instances. No automatic archiving.)
- No "edit just future instances from this point" affordance — only "edit template" (affects all future) or "edit single instance" (creates an override).
- No bulk override creation (e.g., "skip the next 3 weeks of gym") — user has to create each override individually or temporarily pause the Priority. v1.1 candidate.

## Security & Data Safety

### Markdown rendering (XSS)

All markdown content (Priority memory bodies, Task/Event descriptions, chat content, Coach proposals) renders exclusively through `react-markdown` + `rehype-sanitize`. Configuration:
- Strip `<script>` and `on*` event handlers
- Disallow `javascript:`, `data:`, `vbscript:` URL schemes
- Allow only safe tags (paragraphs, headings, links, lists, code, em/strong, blockquote, tables)
- NEVER use `dangerouslySetInnerHTML`

### Cost circuit breaker

Before every LLM API call, check projected cost against `user_settings` cost caps. Sum today's spend (from `chat_sessions.total_cost_usd` for sessions opened today) and this month's. If projected call would exceed either cap, abort with clear message.

```typescript
async function withinCostCap(userId: string, projectedUsd: number): Promise<{ ok: true } | { ok: false, reason: string }> {
  const settings = await getUserSettings(userId);
  const todayCost = await sumTodayCost(userId);
  const monthCost = await sumMonthCost(userId);
  if (todayCost + projectedUsd > settings.daily_cost_cap_usd) return { ok: false, reason: `Daily cost cap of $${settings.daily_cost_cap_usd} would be exceeded` };
  if (monthCost + projectedUsd > settings.monthly_cost_cap_usd) return { ok: false, reason: `Monthly cost cap of $${settings.monthly_cost_cap_usd} would be exceeded` };
  return { ok: true };
}
```

When triggered: surface clear in-app message. AI features pause; non-AI features continue working. User can raise caps in settings or wait for window reset.

### Soft delete + data export

All user-content tables use `deleted_at` columns. Reads filter `WHERE deleted_at IS NULL`.

`GET /api/export` returns JSON with all user data including soft-deleted rows. Streamed download. Includes:

```json
{
  "exported_at": "2026-05-02T15:30:00Z",
  "user": { /* profile */ },
  "user_settings": { /* settings, with API key REDACTED */ },
  "priorities": [ /* including soft-deleted */ ],
  "priority_memory": [ /* including soft-deleted */ ],
  "priority_files": [ /* metadata only, not file contents */ ],
  "quarters": [],
  "quarter_week_focus": [],
  "tasks": [],
  "events": [],
  "calendar_feed_configs": [ /* URLs RETAINED — user data */ ],
  "calendar_feed_events": [],
  "chat_sessions": [],
  "chat_messages": []
}
```

### API key encryption at rest

`user_settings.anthropic_api_key` encrypted at the application layer using a symmetric key from environment variable (`API_KEY_ENCRYPTION_KEY`, 32 bytes). AES-GCM. Decrypt only when constructing Anthropic SDK client. Never log decrypted key.

**Encryption key rotation (acceptable v1 limitation)**: The encryption key in `API_KEY_ENCRYPTION_KEY` env var is treated as immutable for v1. If the key needs to rotate (compromise, key migration), the current pattern requires:
1. User manually re-enters their API key in Settings (because the old encrypted value can no longer be decrypted)
2. The new value is encrypted with the new env-var key

There is no automatic re-encryption migration in v1. Acceptable because:
- Single-user v1 — only one user to re-onboard the key
- Operationally simple — no migration tooling to write or test
- The likelihood of needing key rotation in v1 is low

v1.1 candidate: store the encryption key version with the encrypted value (e.g., `key_v1::<ciphertext>`); support multiple key versions for graceful rotation.

## Concurrency Model

### Planning generation single-flight

When `POST /api/plan/[horizon]` arrives:

1. Try to acquire lock for `(user_id, 'plan:' + horizon + ':' + context_ref)` via `INSERT INTO generation_locks ... ON CONFLICT DO NOTHING RETURNING *`
2. If acquired: proceed with session creation/lookup. On completion (success or error), release lock
3. If not acquired and existing lock past `expires_at`: treat as stale, overwrite, proceed
4. Otherwise: return `202 Accepted` with `{ status: 'in_progress', try_again_in_ms: 5000 }`. Client polls.

This prevents the "two browser tabs both start planning" race.

### Master chat single-flight per user

Same lock pattern with key `(user_id, 'master_chat')` to prevent two concurrent master chat invocations from creating racing previews.

### Calendar sync concurrency

Cron uses `SELECT ... FOR UPDATE SKIP LOCKED` (Postgres-native row locking) when picking up due feeds. If two cron invocations overlap, no double-sync.

## Timezone Handling

- All `timestamptz` columns store UTC. Drizzle converts JS Date objects automatically.
- `users.timezone` is the source of truth for rendering and date math
- Display: `formatInTimeZone(date, user.timezone, 'yyyy-MM-dd HH:mm')`
- Date inputs: when user picks "Tuesday May 4," interpret as start-of-Tuesday in their timezone, then store as UTC
- Calendar feed events from .ics: `ical.js` respects VTIMEZONE; normalize to UTC for storage
- Planning chatbots receive dates and times in user's timezone in prompt (so reasoning is local)
- Cron runs in UTC; checks last_synced_at + cadence_min against UTC now()
- DST: routine items use date-fns-tz `addDays`-style functions to handle correctly

## Verbatim Prompts

These are the prompts Claude Code must use exactly. Do not paraphrase or "improve" them — they are the product.

### Prompt 1: Onboarding Coach (interview)

System prompt:

```
You are the Onboarding Coach for Priorities, a life-management app. Your job is to interview the user about the most important areas of their life so the app can propose a starter "council of Priorities" — chatbot personas that will help them plan their life.

You will conversationally cover these 7 topics, in roughly this order, but flexibly:
1. Work / career — what they do, current focus, ambitions
2. Health — physical and mental, exercise, nutrition, sleep, current concerns
3. Relationships — family, partner, close friends, dating
4. Hobbies / creative pursuits — music, sports, reading, art, anything they care about
5. Finances — budgeting, saving, investing, big upcoming expenses
6. Ambitions — what they want to do in the next year that doesn't fit elsewhere
7. Recent life events — anything new (job change, move, baby, loss, illness, milestone)

Style guidelines:
- Warm but efficient. Total interview should take 10-15 minutes.
- One topic at a time. When you've gathered enough on one topic (usually 2-4 user messages), explicitly transition: "Got it — let's move to your health."
- Open-ended questions, not yes/no. "Tell me about your work" not "Do you have a job?"
- Reflect back what you hear briefly before moving on. The user should feel heard.
- Don't lecture, don't suggest priorities yet. You're gathering, not proposing.
- If the user says "skip this topic" or "I don't want to talk about that," respect it and move on.
- After all 7 topics are covered, say: "I have enough to propose your starter council. Ready to see it?" Wait for their confirmation, then mark the interview complete.

Be honest about your role. You're not a therapist or a coach in any deep sense — you're an intake interviewer for a life-planning tool.
```

### Prompt 2: Onboarding Coach (council proposal)

Run as a non-streaming structured-output call after interview ends. Input: full interview transcript. System prompt:

```
You are generating a starter council of Priorities for a user based on their interview transcript.

A "council" is a set of 5-10 Priorities (chatbot personas) representing the most important areas of the user's life. Each Priority will help the user plan their quarter, week, and day.

Output a JSON object matching this schema:
{
  "proposed_priorities": [
    {
      "name": "Short label (e.g., 'Gym', 'Work', 'Piano')",
      "icon": { "color": "<hex color>", "style": "classic|rounded|serif|script" },
      "smart_goal": "1-2 sentence SMART goal draft based on what the user said",
      "quarterly_strategy": "1-3 sentence description of how this Priority will help plan a 13-week quarter (e.g., 'Periodize the quarter into base/build/peak/taper blocks')",
      "weekly_strategy": "1-3 sentence description of how this Priority will help plan a week",
      "daily_strategy": "1-3 sentence description of how this Priority will help time-block a day",
      "min_minutes_per_week": <int>,
      "max_minutes_per_week": <int>,
      "check_in_cadence": ["quarterly" | "weekly" | "daily"],
      "starter_memory_entries": [
        { "body": "<markdown content distilled from interview>", "tags": ["<tag>"] }
      ]
    }
  ],
  "rationale": "Brief explanation of why these Priorities and not others"
}

Guidelines:
- 5-10 Priorities. Don't propose more than what the user actually mentioned.
- Each Priority should be a real distinct area, not overlapping. Don't propose both "Health" and "Gym" — pick the one that fits.
- For each Priority, the starter_memory_entries should capture concrete details the user shared (e.g., "User mentioned they have piano lessons every Tuesday with Maya" goes into Piano's memory).
- Cadence guidance: daily for things needing daily planning (work, gym, routines); weekly for things planned weekly but not daily (nutrition, household chores, social); quarterly for things only touched quarterly (car maintenance, big trips, fashion).
- Min/max minutes/week: be realistic. Daily-cadence items: 60-300 min/week. Weekly-cadence items: 30-120 min/week. Quarterly-cadence items: 0-30 min/week.
- Icon colors: distinct per Priority for visual differentiation.
```

### Prompt 3: Priority Creation (manual)

System prompt for the chatbot that walks user through filling 8 Priority fields:

```
You are helping the user create a new Priority for their council. Walk them through filling these 8 fields, one or two at a time:

1. Name (short label)
2. Icon (color + style — they can describe or you can suggest)
3. SMART goal (1-2 sentences capturing what success looks like)
4. Quarterly strategy (how this Priority helps plan a 13-week quarter)
5. Weekly strategy (how it helps plan a week)
6. Daily strategy (how it helps time-block a day)
7. Min and Max minutes per week (realistic range — they can give either or both)
8. Check-in cadence (which planning sessions: quarterly, weekly, daily, or any combination)

Style:
- Conversational, not form-like. "What should we call this Priority?" not "Enter a name."
- One question per turn. After they answer, briefly reflect back and move to the next.
- If they ask for help on any field, give 1-2 short examples and let them choose or write their own.
- If they want to skip a field, set a sensible default (don't block).
- After all fields are filled, summarize what you've captured and ask if they want to make any changes before saving.
- When they confirm, output a tool call `save_priority` with the final field values.

Tools available:
- set_field(field_name, value) — call after each user response to incrementally save
- save_priority() — call when user confirms final values
```

### Prompt 4: Quarter Planning (per Priority)

For each Priority in the queue during a Quarter Plan session, system prompt is dynamically constructed:

```
You are the [PRIORITY_NAME] Priority for [USER_NAME]'s council.

Your SMART goal: [PRIORITY.SMART_GOAL]
Your quarterly planning strategy: [PRIORITY.QUARTERLY_STRATEGY]
Your relevant memory:
[PRIORITY.PINNED_SUMMARY]
[Most recent 10 PRIORITY_MEMORY entries, with timestamps]

Current quarter: [QUARTER.LABEL] ([QUARTER.START_DATE] to [QUARTER.END_DATE])
Number of weeks in this quarter: [N_WEEKS] (13 for a full quarter, fewer for partial)

Your job in this conversation: help the user define a focus or plan for each of the [N_WEEKS] weeks of this quarter, as it relates to your Priority.

Already-claimed weeks by higher-priority Priorities:
[List of (week_number, focus_label) for any quarter_week_focus already set]

Your output options:
- Use the tool `set_week_focus(week_number, focus_label)` to set focus for any week. Focus_label is a short string (e.g., "Base — 4 workouts/wk", "Recovery week", "Big race")
- Tool `add_memory(body, tags)` to capture context worth remembering for future sessions

Style:
- Conversational. Walk through what makes sense for this quarter.
- Reference what you know about the user (from your memory) when relevant.
- If you have nothing to plan for a particular week, leave it unset.
- When done, call `signal_done()` to indicate you've finished planning.
```

### Prompt 5: Weekly Planning (per Priority)

Same shape, weekly-scoped:

```
You are the [PRIORITY_NAME] Priority for [USER_NAME]'s council.

Your SMART goal: [PRIORITY.SMART_GOAL]
Your weekly planning strategy: [PRIORITY.WEEKLY_STRATEGY]
Your relevant memory: [PINNED_SUMMARY + 10 most recent entries]

Current week: [WEEK_START_DATE] to [WEEK_END_DATE]
Quarter context: [QUARTER.LABEL], week [WEEK_NUMBER] of quarter
This week's focus for you (from quarter plan): [QUARTER_WEEK_FOCUS for this priority + this week_number, if set]

Already-scheduled by higher-priority Priorities:
[List of tasks/events for this week from priorities with lower position numbers, grouped by day]

Calendar feed events this week:
[List of all calendar_feed_events for this week, grouped by day]

Your job: assign tasks (and/or create events) to specific days of the week for your Priority, working within the week's focus and around already-claimed time.

Tools:
- create_task(title, target_date, description?, recurrence?) — assign a Task to a specific day, no time block yet
- create_event(title, start_time, end_time, description?, recurrence?) — schedule a time-bound Event
- add_memory(body, tags)
- signal_done()

Style: brief, action-oriented. Confirm with the user before creating each batch.
```

### Prompt 6: Daily Planning (per Priority)

```
You are the [PRIORITY_NAME] Priority for [USER_NAME]'s council.

Your SMART goal: [PRIORITY.SMART_GOAL]
Your daily planning strategy: [PRIORITY.DAILY_STRATEGY]
Your relevant memory: [PINNED_SUMMARY + 10 most recent entries]

Tomorrow's date: [TOMORROW_DATE]
Tomorrow's day of week: [DAY_OF_WEEK]

Tasks for you tomorrow (from weekly plan, not yet time-blocked):
[List of tasks with target_date = tomorrow and owner_priority_id = this priority]

Events for you tomorrow (already time-blocked):
[List of events with start_time on tomorrow]

Already-blocked time tomorrow (by higher-priority Priorities or calendar feeds):
[Sorted list of (start_time, end_time, source) — Priority name or calendar feed name]

Your job: time-block your tasks for tomorrow. For each task, suggest a start/end time that fits around already-blocked time and makes sense for the task type.

Tools:
- set_task_time_block(task_id, start_time, end_time) — assign time slot
- create_event(title, start_time, end_time, description?) — if you need to add a new time-blocked thing
- add_memory(body, tags)
- signal_done()

Style: efficient. For routine items (e.g., morning routine), default to user's typical times. For flexible items, suggest based on energy fit (deep work mornings, recovery evenings, etc.).
```

### Prompt 7: Master Chat Router

System prompt for the master chat router. Non-streaming, structured output.

```
You are the master chat router for Priorities, a life-management app. The user is messaging you about something happening in their life. Your job is to figure out which of their Priorities (chatbot personas) should be updated and propose specific actions.

User's council (Priorities):
[List of all active Priorities: id, name, icon, smart_goal_summary, current pinned_summary]

User's current screen context:
[ScreenContext JSON]

Conversation history with master chat:
[Last 20 messages]

User's new message: [USER_MESSAGE]

Output a structured JSON response with this schema:
{
  "understanding": "Free-form: what you think the user is saying",
  "affected_priorities": [{ "id": "...", "reasoning": "Why this Priority is affected" }],
  "proposed_actions": [<see ProposedAction schema>],
  "preview_summary": "Human-readable summary of what will happen if the user confirms",
  "needs_clarification": "If you genuinely don't know what to do, ask the user a question here instead of proposing actions"
}

ProposedAction types you can produce:
- add_priority_memory: capture something noteworthy in a Priority's memory (e.g., "User added Chopin Nocturne Op 9 No 2 to repertoire" goes into Piano's memory)
- create_task / modify_task / complete_task: act on tasks
- create_event / modify_event: act on events
- reschedule_quarter_week_focus: change a week's focus in the active quarter
- update_priority_field: change a Priority's structured field

Guidelines:
- Be conservative. If unsure which Priority is affected, set needs_clarification instead of guessing.
- Use screen context to resolve references like "this", "that", "the Tuesday block", "this week".
- Multiple Priorities can be affected — that's fine. Propose actions for each.
- The user will see your preview_summary and either confirm or cancel. Make summaries concrete: "Skip tomorrow's gym, reschedule to Friday 5pm" not "Update gym schedule."
- Never act without surfacing a preview. Even small changes (a single memory entry) need preview.
```

### Prompt 8: Memory Summarization

Run as a non-streaming Haiku call when a Priority's memory exceeds 50 entries. Input: existing pinned_summary + the older entries being archived. Output: updated pinned_summary.

```
You are compressing memory for the [PRIORITY_NAME] Priority — a chatbot persona that helps the user plan a specific area of their life.

Existing pinned summary (the long-term memory of this Priority):
[CURRENT_PINNED_SUMMARY or "(none yet)"]

Older memory entries being archived (will no longer be visible to the chatbot after this compression):
[List of entries: { created_at, body, tags, source }]

Your job: produce an updated pinned_summary that integrates the most important enduring context from the older entries. Output ONLY the new summary text — no preamble, no markdown headers, no commentary.

Guidelines:
- Keep enduring patterns and anchoring facts (e.g., "User has piano lessons every Tuesday with Maya since Jan 2026").
- Drop tactical details that won't matter in a month (e.g., "Practiced for 25 minutes on March 5" — drop unless it's part of a meaningful pattern).
- Keep specific names, dates, places, preferences, and constraints the user has shared.
- Aim for under 2000 tokens. If the current summary plus integrated context exceeds that, compress further — drop the least-anchoring details.
- Write in past-tense factual style: "User prefers morning workouts," "User's coach Mike has been recommending more cardio," "User's gym membership at Equinox includes pool access."
- Preserve emotional/relational context where it would change planning advice (e.g., "User has been feeling burned out — recommend lower-intensity weeks").
```

## Heuristics & Thresholds

| Setting | Default | Rationale |
|---|---|---|
| Daily cost cap | $5/day | Hard ceiling for AI features; user-configurable |
| Monthly cost cap | $50/month | Hard ceiling; user-configurable |
| Plan generation lock TTL | 90 seconds | Matches max plan-gen time; stale locks released by next attempt |
| Master chat lock TTL | 30 seconds | Shorter — single-turn router |
| Calendar feed default sync cadence | 30 min | Balance between freshness and API load |
| Calendar sync cron interval | 5 min | Picks up due feeds; 30 min cadence means feeds sync every 30 min on average |
| Recurrence patterns supported in v1 | daily, weekly (with byday), monthly (with bymonthday) | Yearly deferred |
| Quarter length | 13 weeks (calendar-aligned) | Matches calendar quarters; first quarter on signup may be partial |
| Onboarding interview topic count | 7 | Work, health, relationships, hobbies, finances, ambitions, recent events |
| Council proposal size target | 5-10 Priorities | Big enough to feel real, small enough not to overwhelm |
| Memory entries surfaced in chatbot context | most recent 10 | Plus pinned_summary always |
| Master chat history surfaced | last 20 messages | Bounded for cost |
| Priority memory soft cap | 50 entries | Triggers auto-summarization when exceeded |
| Pinned summary soft cap | ~2000 tokens | Summarization compresses further if approaching this cap |
| Memory summarization lock TTL | 30 seconds | Prevents concurrent summarization on same Priority |
| Magic link TTL | 15 minutes | Standard |
| Session cookie TTL | 30 days | Mobile-friendly |

## API Call Patterns

### Model routing

| Use case | Model | Reason |
|---|---|---|
| Onboarding Coach interview chat | claude-sonnet-4-6 | Quality matters; user is deciding to commit |
| Onboarding Council Proposal generation | claude-sonnet-4-6 | One-shot, structured, high-quality |
| Priority Creation chatbot | claude-sonnet-4-6 | Quality moment |
| Quarter / Weekly / Daily Planning chat | claude-sonnet-4-6 | The product moment |
| Master Chat router | claude-sonnet-4-6 | Routing must be accurate |
| Memory entry summarization | claude-haiku-4-5 | Background ops, simple transformations |
| Title generation for chat sessions | claude-haiku-4-5 | Simple |

All calls use `@anthropic-ai/sdk` directly. Per-user API key (decrypted from `user_settings.anthropic_api_key`).

### Streaming pattern

Planning sessions and Priority Creation use streaming. Master chat does NOT stream (needs full structured output before preview).

```typescript
const stream = await client.messages.stream({
  model: 'claude-sonnet-4-6',
  max_tokens: 4000,
  system: systemPrompt,
  messages: history,
  tools: priorityTools,
});

for await (const chunk of stream) {
  // forward to client via SSE
}

const final = await stream.finalMessage();
// persist assistant message + tool calls
// update session.total_cost_usd
```

### Tool use pattern

Planning chatbots and creation chatbots use tool calls to take structured actions. Tools are defined per session type. Server intercepts tool_use blocks, executes the corresponding DB operations, and returns tool_result back to the model in next turn.

For destructive tools (delete, modify), planning sessions execute immediately (the user is in a planning flow and expects the chatbot to act). For master chat, no immediate execution — all actions are previewed first.

### Cost tracking

After every API call, calculate cost from `usage.input_tokens` and `usage.output_tokens` using current pricing. Increment `chat_sessions.total_cost_usd` and `chat_messages.cost_usd`. Pricing constants in app config; update when Anthropic changes pricing.

## Error Handling

| Error class | UX response |
|---|---|
| User has no API key → tries AI feature | Block at action; redirect to Settings → API Key with explanatory banner |
| Anthropic API: 401 unauthorized | "Your API key isn't valid. Update it in Settings." |
| Anthropic API: 429 rate limit | "Rate limited by Anthropic. Try again in a few seconds." Auto-retry once after 5s. |
| Anthropic API: 500/503 | "Anthropic is having an issue. Try again." Auto-retry once. |
| Cost cap reached | Surface cap-reached banner. AI features pause. Non-AI continues. |
| Calendar feed: 404 / unreachable | Mark feed as errored (last_sync_error set). Banner in settings. Daily view shows last cached events with stale indicator. |
| Calendar feed: malformed .ics | Same as above. |
| Plan generation lock conflict | Return 202 with try_again_in_ms. Client polls. |
| Master chat preview but user navigates away | Pending preview discarded after 5 minutes. |
| Streaming chat connection drops | Persisted partial message marked is_complete=false. On reconnect, render with "interrupted" indicator + regenerate button. |
| LLM returns malformed JSON for structured output | Retry once with stricter system reminder. If still malformed, surface error, ask user to retry. |
| Database connection drop | Show maintenance message; retry transparently when restored. |

## Edge Cases & Limitations

**Accepted v1 limitations (functional):**
- No deduplication of Tasks/Events across Priorities
- Plan does not adapt mid-day. Once daily plan is set, it's static unless user re-plans.
- No notifications (push or email). User opens app intentionally.
- No offline writes; read-only when offline.
- No bi-directional calendar sync. .ics import is read-only.
- No voice input.
- No advanced visualizations (no radar charts, no progress charts beyond per-Priority weekly time tracking).
- No search across Priorities / memory / chat history.
- No yearly planning ritual (yearly notes only, attached ambiently to Priority memory).
- **Sub-app integration is fully designed in FDD/sub-app workflow doc but NOT IMPLEMENTED.** No "Connect a sub-app" UI in v1.
- No trash recovery UI (soft-deleted items recoverable via export only).
- No item dedup across sources.
- No multi-user / sharing.
- No council templates beyond what Onboarding Coach generates.
- Minutes-per-week is tracking-only. Planner notes when over/under range but never refuses.

**Accepted v1 limitations (technical/operational):**
- No rate limiting on own API endpoints. Single-user v1, low risk.
- No formal email verification. Magic link is the substitute.
- No user-facing audit log of changes.
- Sub-app contract versioning is implicit (v1 only).
- No automated tests beyond manual verification.
- No formal observability stack (Sentry, etc.). Vercel logs + chat_sessions cost tracking cover most v1 debugging.
- No edge runtime optimization. All routes use Node runtime by default.
- No connection pool tuning beyond Neon serverless defaults.
- No regen idempotency beyond generation_locks.
- PWA cross-app navigation awkwardness (irrelevant in v1 since no sub-apps shipped, but resolves cleanly in v2 React Native rebuild).
- **No master chat undo for confirmed actions.** Once an action is applied via master chat confirm, it sticks. To "undo," the user has to issue a new master chat command (e.g., "actually re-add that task I just deleted"). Acceptable for v1; explicit "undo" is a v1.1 candidate.
- **Council UX optimized for ≤20 active Priorities.** Larger councils may make planning sessions feel long. No hard cap; soft UX guidance only. Pause/archive lesser-used Priorities to keep working set focused.
- **Cost pricing constants in app config may drift from Anthropic's actual pricing.** Update the constants when Anthropic announces price changes. Wrong constants cause cost-cap calculations to be off but don't break functionality.
- **Encryption key rotation requires manual user action.** If `API_KEY_ENCRYPTION_KEY` rotates, user must re-enter their Anthropic API key in Settings. No automatic re-encryption migration in v1.

**Hard fail cases:**
- User has no API key AND tries to use AI features. Surface clear "add key" message; no degradation.
- Database down. Maintenance message all routes.
- Cost cap hit. AI features pause; non-AI continues.

**Soft fail cases:**
- Calendar feed broken. Banner; use last cached.
- Streaming planning chat interrupted. Partial message saved; regenerate button.
- LLM returns malformed structured output. One retry; if still bad, surface error.
- Anthropic insufficient credits. Clear message: "Out of API credits. Add more at console.anthropic.com."

## First-Time UX

1. New user lands at `/signin` (no session)
2. Enters email → magic link sent
3. Taps link → `/auth/callback` creates session
4. Detected as first-time (no `priorities` rows) → redirect to `/onboarding`
5. Onboarding Welcome page with two CTAs: Start Interview, Skip and Start Blank
6. If interview: Coach chat session created, walks through 7 topics, generates Council Proposal, user reviews + accepts → all Priorities created → land at `/priorities`
7. If skip: land at `/priorities` with empty list and "Create your first Priority" CTA
8. From here, user can begin planning or capture via master chat

The very first quarter on signup is partial: covers from today through end of current calendar quarter. Subsequent quarters are full 13 weeks aligned to calendar quarters.

## Cost Surfacing

Settings page tab `Cost & Usage` shows:
- Current month-to-date spend vs monthly cap (progress bar)
- Today's spend vs daily cap
- Last 30 days spend trendline (sparkline)
- Per-session-type breakdown (planning / chat / onboarding)
- Adjust caps (with confirmation modal)

Banner appears app-wide at:
- 80% of daily cap → yellow warning banner ("$4.20 used today, $5 daily cap")
- 100% of cap → red banner with paused state ("$5 daily cap reached. AI features paused. Reset at midnight or raise cap.")

## Database Migrations

Schema changes are managed via Drizzle Kit. Workflow:

1. **Generate migration**: when schema files change (e.g., adding a column, new table), Claude Code runs `drizzle-kit generate` to produce a new migration file in `drizzle/migrations/`. Each file is a numbered, immutable SQL script representing a forward-only change.
2. **Review migration**: Claude Code shows the generated migration in chat for the owner to review before committing. Migrations that drop columns, drop tables, or rename are flagged as destructive and require explicit confirmation.
3. **Commit migration**: the migration file ships in the same commit as the schema change.
4. **Apply on deploy**: a Vercel build step runs `drizzle-kit migrate` against the production database before the new app version goes live. This ensures schema and code stay in lockstep — the old code never runs against new schema, and vice versa.
5. **Local development**: Claude Code does not run migrations against production for testing; the dev loop relies on Vercel preview deployments which can run against the same production DB (single-user v1) or a branch DB (Neon's branching feature, deferred to v1.1 if multi-user).

**Roll-forward only** in v1: no rollback automation. If a migration goes bad, the fix is another migration that corrects it (e.g., re-add the column that shouldn't have been dropped). Drizzle Kit supports rollback in principle but the workflow is more complex than it's worth for solo personal use.

**Schema drift detection**: Drizzle's `check` command can be added to a Vercel pre-build step to fail builds where the schema definitions don't match the latest migration — catches "forgot to generate migration" mistakes.

## Build Order Recommendation

20 milestones. Status tracked in `PROJECT-STATUS.md`. End-to-end usable somewhere around milestone 9.

| # | Milestone | Notes |
|---|---|---|
| 1 | Project scaffold (Next.js 15 + Tailwind + Drizzle + Lucia magic link) | Should result in deployable empty app on Vercel preview URL |
| 2 | Database setup + magic link auth flow (signin, auth callback, signout) | |
| 3 | User settings + Settings page skeleton (tabs, profile tab functional, API key tab functional with encryption) | |
| 4 | Priorities table + Council Home (Priorities List) read-only | Static list display first |
| 5 | Manual Priority CRUD + drag-to-reorder + pause/archive | |
| 6 | Priority Detail page with full edit (all structured core fields, memory entries CRUD, file uploads) | Pure manual editing, no chatbot yet |
| 7 | Quarters table + first-quarter calculation logic + display in Priorities List header | |
| 8 | Tasks + Events tables + manual CRUD via Priority Detail | Lay foundation for planning to populate later |
| 9 | Daily View page (today's Tasks + Events, checkboxes, date navigation) | **End-to-end works at this point.** Manual life manager, no AI yet. |
| 10 | Calendar feed config + .ics ingestion + Vercel cron + display in Daily View | |
| 11 | Quarter Plan UI scaffold (queue + chat + 13-week calendar layout) | Static UI, no chatbot yet |
| 12 | Quarter Planning chatbot per Priority (verbatim Prompt 4) + tool calls + persist quarter_week_focus | First AI feature live. |
| 13 | Weekly Plan UI + chatbot (Prompt 5) + persist Tasks/Events with target_date | |
| 14 | Daily Plan UI + chatbot (Prompt 6) — 3-step evening review structure | |
| 15 | Re-planning mode picker (Replan all / Adjust) for all three horizons | |
| 16 | Master Chat — preview generation (Prompt 7) + screen context envelope from all relevant pages | |
| 17 | Master Chat — confirm execution (action handlers for each ProposedAction type) + cancel + persistent history | |
| 18 | Onboarding Coach (Prompts 1 + 2) + Council Proposal Review + accept handler | |
| 19 | Cost surfacing (Settings → Cost & Usage tab) + cost cap banners + circuit breaker integration with all AI calls | |
| 20 | PWA manifest + service worker + polish pass (error states, empty states, loading skeletons, conflict feedback messaging, weekly time tracking display per Priority) | |

## Acceptance Criteria

v1 is complete when all of these pass manual verification:

1. **Account creation**: New user can sign in via magic link, complete or skip Onboarding Coach, end at populated or empty Priorities List.
2. **Onboarding Coach**: Interview covers 7 topics, generates 5-10 reasonable proposed Priorities with pre-populated knowledge bases, allows edit/remove/add, accept creates all Priorities in one operation. Mid-interview exit + return resumes where user left off.
3. **Manual Priority creation**: Can create a Priority via chatbot interview through 8 fields, ends with editable Priority Detail.
4. **Council management**: Drag-to-reorder works, persists, applies to next planning session. Pause/archive work. Edit fields work. Delete works (soft).
5. **Quarter planning**: Can do a Quarter Plan that walks through every active Priority with quarterly cadence, each Priority's chatbot uses its quarterly_strategy correctly, ends with all weeks labeled per Priority.
6. **Weekly planning**: Same for weekly. Tasks/Events created with target_date. Conflict resolution surfaces visibly when later Priorities try to claim already-blocked time.
7. **Daily planning**: 3-step evening review (Progress / Capture / Plan tomorrow) works. Time blocks set on tasks. Calendar feed events appear as immovable.
8. **Re-planning**: Mode picker appears on second-trigger of any horizon. Replan all and Adjust both work.
9. **Master chat**: Open from any page (preserves screen context). Type natural language. Preview surfaces with affected Priorities + proposed actions + summary. Confirm executes; cancel discards.
10. **Daily View**: Renders today's plan correctly (time blocks + unscheduled tasks + calendar feed events). Check off tasks works.
11. **Calendar feeds**: Add a Google or Outlook .ics URL. First sync pulls events. Cron syncs on cadence. Events appear in Daily View and as immovable in Daily Plan.
12. **Cost caps**: Set low daily cap ($0.50 for testing). Trigger AI feature. Cap warning appears at 80%; AI pauses at 100%; non-AI features keep working.
13. **Data export**: Settings → Data → Export downloads JSON file with all data including soft-deleted rows, API key redacted.
14. **PWA**: Install on phone home screen. App works as standalone (no Safari chrome). Service worker caches static assets.
15. **Markdown safety**: Try injecting `<script>alert(1)</script>` in a Priority memory body. Verify it renders as text, not executed.
16. **Concurrency**: Open two browser tabs. Trigger planning in both. Second one gets 202 try-again, doesn't double-create sessions.
17. **Timezone correctness**: Set user timezone to Pacific. Create a Task "due Tuesday" at 10pm Monday Pacific. Verify it's saved as Tuesday Pacific (not Monday UTC).
