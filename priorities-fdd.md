# Priorities — Functional Design Document

> What Priorities does for the user. Pages, flows, entity model, scope, success criteria. Reference for Claude Code on UX decisions; supporting context to the TDD's technical spec.

## Overview

Priorities is a mobile-first PWA for planning life by sequentially conversing with a council of priority chatbots across three nested time horizons (quarterly, weekly, daily), with a master chat router for ad-hoc capture throughout the day.

The user creates a Priority (chatbot persona) for each area of life that matters to them — Gym, Nutrition, Work, Piano, Car Maintenance, Wellbeing, etc. Each Priority has a structured core (SMART goal, planning strategies for each horizon, minutes-per-week target, check-in cadence) plus free-form memory the chatbot reads from and updates over time. When it's time to plan, the user goes through the council in user-defined order; the order determines which Priority gets to claim calendar time first (drag-to-reorder = conflict resolution). Throughout the day, the master chat lets the user say things in natural language and have the right Priority updated automatically (with a confirmation preview before any change applies).

## Core Concepts

- **Council**: the ordered set of Priorities a user has created. Order is set by drag-and-drop and dictates planning sequence + calendar fill order.
- **Priority**: a chatbot persona representing one area of life. Has a structured core + free-form memory. Owns its own Tasks and Events.
- **Three horizons**: Quarter (13 weeks, calendar-aligned), Week (Mon-Sun), Day (24 hours). Each horizon has its own planning ritual with the same UI shape: queue at top, chat in middle, calendar at bottom.
- **Master chat**: the always-available router. User says something, LLM auto-detects which Priority(ies) are affected, surfaces a preview, applies on confirmation. Receives full screen context envelope so commands like "delete that block" resolve correctly.
- **Conflict resolution = order**: when planning, each Priority can only place items in time/days/weeks not yet claimed by a higher-priority Priority. External calendar feed events sit above the council (immovable).

## Workflows

### Workflow 1: Onboarding (first-run)

1. User signs up → Sign Up page (email + magic link).
2. Lands on Onboarding Coach Welcome page — short intro, two options: "Start interview" or "Skip and start blank."
3. If interview: chat with Onboarding Coach, who asks open-ended questions about life domains (work, health, relationships, hobbies, finances, current ambitions, recent life events). The interview state is saved continuously — if the user closes the app mid-interview, returning to the Coach picks up exactly where they left off (with the prior chat history visible). The user can also exit early and return later to resume.
4. Coach proposes a council — typically 5-10 Priorities with names, suggested icons, and pre-populated knowledge bases derived from interview responses.
5. User reviews proposal: keep / edit / remove each, optionally add new ones, then accepts.
6. Lands on Priorities List with the council populated.

If skip path: lands on empty Priorities List with prominent "Create your first Priority" CTA.

### Workflow 2: Create Priority manually

1. From Priorities List, tap "Create Priority."
2. Priority Creation Chat opens — chatbot walks through preset questions to fill the structured core: name, icon (P emoji color/style picker), SMART goal, what success looks like at quarter/week/day level (becomes the three planning strategies), minutes-per-week target, which check-in horizons apply.
3. After chat, lands on Priority Detail with all fields populated and editable.
4. User confirms or edits, then returns to Priorities List with the new Priority added at the bottom.

### Workflow 3: Quarter Plan

1. Triggered by a banner on Priorities List ("Q2 starts April 1 — plan it") or by tapping a "Plan Quarter" button.
2. Lands on Quarter Plan page.
3. Top: priority queue showing council in order, current Priority highlighted, completed Priorities checked.
4. Middle: chat with current Priority. The Priority's chatbot uses its `quarterly_strategy` field to drive the conversation — for Gym: "let's structure your 13 weeks: base, build, peak, taper. How many weeks of base do you want?" For Car Maintenance: "Anything specific this quarter? Oil change, registration?"
5. Bottom: 13-week calendar grid showing all weeks color-coded by Priority. Filling up as conversations conclude.
6. After each Priority's chat finishes, the user taps "Next" to advance to the next Priority in queue (or "Skip" to bypass a Priority for this quarter).
7. When all Priorities are done, returns to Priorities List with the quarter set.

### Workflow 4: Weekly Plan

1. Triggered by banner (e.g., on the user's configured planning day, default Sunday evening) or by tapping "Plan Week."
2. Lands on Weekly Plan page.
3. Same shape: queue at top, chat in middle, week calendar (Mon-Sun day columns) at bottom.
4. Chat with each Priority in order. The Priority uses its `weekly_strategy` field — for Gym: "this week is build week 2; here are 4 workouts. Which days?" For Nutrition: "let's pick meals and build the grocery list."
5. Each Priority's outputs land on the week calendar as Tasks (assigned to specific days, no time block yet) or Events (with start/end times).
6. When done, returns to Daily View with this week visible.

### Workflow 5: Daily Plan (evening review)

The daily session is structured as a 3-step evening review (per the original design intent):

1. Triggered by an evening banner (at user's configured `evening_review_time`, default 8pm) or by tapping "Plan Tomorrow."
2. Lands on Daily Plan page.
3. **Step 1 — Progress check**: brief structured walkthrough of today. For each Priority that had Tasks/Events scheduled today, confirm what got done, what got skipped, what got moved. This is fast (1 question per Priority, often just a yes/done check).
4. **Step 2 — Capture**: open prompt: "Anything new to capture before planning tomorrow?" User can mention things that came up. The Coach (master chat surface here) routes captures to the right Priorities just like normal master chat.
5. **Step 3 — Plan tomorrow**: queue at top, chat in middle, day timeline at bottom. For each Priority in order, the Priority uses its `daily_strategy` to propose tomorrow's time blocks. Calendar feed events for tomorrow are pre-loaded as immovable blocks. Conflict resolution applies (higher-priority Priorities claim time first).
6. When done, returns to Daily View showing tomorrow.

Step 1 and Step 2 are skippable individually if the user just wants to plan. Step 3 is the only required substep if the user invokes "Plan Tomorrow" without doing the full evening review.

### Workflow 6: Master Chat (ad-hoc, throughout day)

1. From any page, tap the floating master-chat button.
2. Master Chat opens as an overlay sliding from the bottom (about 75% of screen height).
3. The current screen's context is automatically attached (current page, horizon being viewed, focused Priority, visible items).
4. User types a message — examples: "skipping gym tomorrow," "I added Chopin's Nocturne Op 9 No 2 to my piano repertoire," "move that Tuesday cardio block to Thursday," "I won't be able to make my dentist appointment Friday."
5. Master chat's LLM classifier identifies which Priority(ies) are affected and surfaces a preview card: "This will update Gym: skip tomorrow's session, mark as missed. Should I reschedule to another day this week?"
6. User confirms (or cancels, or edits the preview).
7. On confirm, updates apply to the affected Priority's memory and/or active plans; the user sees a success indicator and can continue chatting or close.

### Workflow 7: Daily check-in (passive use)

1. User opens app — lands on Daily View showing today.
2. Sees today's time blocks (priority-colored), unscheduled tasks for today, calendar feed events.
3. Taps to check off completed items.
4. Swipes left/right to navigate to other days; tap a date to jump.
5. At any point can open Master Chat to say something.

### Workflow 8: Council management

1. From Priorities List: long-press and drag a Priority to reorder. Updates take effect for next planning session.
2. Tap a Priority → Priority Detail page.
3. Edit any field of the structured core; add/edit/delete memory entries; upload/remove files.
4. Pause (excludes from planning queues until resumed) or archive (removes from list, retains data) a Priority.

### Workflow 9: Settings

1. From nav, open Settings.
2. Sections: Profile, API Key & Cost Caps, Calendar Feeds, Planning Preferences (default planning day-of-week, evening review time), Data Export.
3. Each section has self-contained edit controls.

### Workflow 10: Re-planning

When the user taps a planning trigger (Plan Quarter / Plan Week / Plan Tomorrow) on a horizon that has already been planned, instead of jumping straight into the planning UI, a mode-picker appears:

- **Replan all**: discards the existing plan for that horizon and starts the council walkthrough from scratch. Confirms before discarding ("This will replace your current Q1 plan. Continue?").
- **Adjust**: keeps the existing plan and lets the user tap a specific element (a week within the quarter, a day within the week, a Priority within the queue) to redo just that part. Useful for "I need to redo just my Gym plan for week 5" without throwing out the whole quarter.

If no plan exists yet for the horizon, the mode picker is skipped and the user enters the standard fresh-planning flow.

### Workflow 11: Connect a Sub-app to a Priority (DESIGNED FOR POST-V1 — NOT IMPLEMENTED)

This workflow is documented for completeness but has no implementation in v1. The "Connect sub-app" affordance does not appear in the v1 Priority Detail UI. Document remains as the spec for when sub-app support gets built.

1. From Priority Detail, scroll to "Sub-app extension" section.
2. Tap "Connect a sub-app" → opens a 4-step wizard.
3. **Step 1**: Enter sub-app base URL (e.g., `https://piano-coach.priorities.app`).
4. **Step 2**: Enter auth token (paste from sub-app's own settings).
5. **Step 3**: Capabilities check — system calls `GET /capabilities` on the sub-app, displays returned info: name, version, available query tools, data shapes supported. User reviews.
6. **Step 4**: Confirm and connect. Sub-app URL + token saved on the Priority.
7. Priority Detail now shows: "Connected to: [sub-app name]" badge with disconnect button, and a list of available tools/queries below.

**Behavioral changes after connection:**
- During planning sessions for this Priority, the planning chatbot may call the sub-app's `/generate` endpoint to enrich its proposals (e.g., Piano Coach generates structured weekly practice plans with sheet music references). Outputs surface as proposed Tasks/Events the user confirms before adding.
- During master chat, the sub-app's query tools are registered as available tools the master chat LLM can call (e.g., "what's my piano repertoire?" → master chat calls Piano Coach's `list_repertoire` query).
- During Priority chat (if accessed directly), the connected sub-app provides additional context to the Priority chatbot.

The full sub-app contract spec (endpoint shapes, auth, integration patterns) lives in `priorities-sub-app-workflow.md`.

## Pages — Layout & Key Actions

### 1. Sign Up / Login
Magic link flow only (no passwords). Email entry → email sent with one-tap login link. Session persists.

### 2. Onboarding Coach Welcome
Single screen with brief value prop, two CTAs: "Start interview (10-15 min)" and "Skip and start blank."

### 3. Onboarding Coach Chat
Full-screen chat. Coach intro at top with progress indicator showing topics covered (Work, Health, Relationships, Hobbies, Finances, Ambitions, Recent life events). Chat scrollable, input at bottom. "End interview early" available at any point.

### 4. Council Proposal Review
List of proposed Priorities as cards. Each card shows: suggested name, suggested icon, 2-3 line summary of proposed knowledge base derived from interview. Per-card actions: Keep / Edit (opens Priority Detail in draft mode) / Remove. Floating "Add Another" for free-form additions. Bottom: "Accept Council" creates all kept Priorities in one operation.

### 5. Priorities List (council home)
- Top: header with current quarter info ("Q1 2026, week 7 of 13"), planning status banners (e.g., "Time to plan this week — last planned 8 days ago")
- Middle: ordered list of Priority cards. Each card: icon, name, status badge (active/paused/archived), minutes/week target, last activity ("Daily plan completed 3h ago," "Weekly plan pending"). Drag handle on the right.
- Bottom action area: Create Priority + contextual planning buttons (Plan Quarter / Plan Week / Plan Tomorrow as relevant)

### 6. Priority Creation Chat
Full-screen chat. Top: "Creating Priority" with progress indicator (Name → Goal → Quarterly Strategy → Weekly Strategy → Daily Strategy → Time → Cadence → Done). Chat scrollable, input at bottom. After completion, transitions to Priority Detail.

### 7. Priority Detail / Edit
Sections (collapsible):
- Identity: name, icon
- Goal: SMART goal text
- Strategies: three text fields (quarterly_strategy, weekly_strategy, daily_strategy)
- Time: min_minutes_per_week + max_minutes_per_week (range slider or two number inputs), check_in_cadence (multi-select chips: Quarterly / Weekly / Daily). Below: weekly tracking display showing current week's allocated minutes for this Priority vs the min-max range (e.g., progress bar with shaded target band; visual indicators for "under target," "in range," "over target")
- Status: active / paused / archived
- Pinned summary (auto-maintained by chatbot, user-editable)
- Memory entries (timestamped list, user can add/edit/delete entries directly)
- Attached files (upload, view, remove)
- **Sub-app extension** (POST-V1 ONLY — section absent from v1 UI; documented for spec completeness): "Connect a sub-app" wizard entry point, or status display if connected
Bottom: Delete Priority (with confirmation)

### 8. Quarter Plan
- Top (~15% screen): horizontal scrollable priority queue. Current = highlighted; completed = checkmark; upcoming = gray.
- Middle (~50%): chat with current Priority. Streaming responses; tool-use confirmations inline; "I'm done with this Priority" button.
- Bottom (~35%): 13-week calendar grid (rows = weeks, columns = priority focus labels color-coded). Tappable to view/edit individual week focus.

### 9. Weekly Plan
Same shape as Quarter Plan but bottom shows the week (Mon-Sun day columns) with tasks/events placed per day, color-coded by Priority.

### 10. Daily Plan
Same shape but bottom shows day timeline (hourly grid 6am-midnight default, scrollable to early/late hours). Time blocks rendered as colored bars with task/event title. Calendar feed events pre-loaded as gray immutable blocks.

### 11. Daily View
- Top: date selector (today highlighted, swipe horizontal for past/future days)
- Middle: day timeline like Daily Plan but read-only with checkbox affordances on tasks. Time-blocked items show as colored bars with title; tap to mark complete or open detail.
- Below timeline: "Unscheduled tasks for today" list with checkboxes
- Bottom-right floating: Master Chat button

### 12. Master Chat (overlay)
Slides from bottom over current page (~75% screen height). Header: "Master Chat" + close button. Below: scrollable history (continuous across all sessions). Bottom: text input. Inline preview cards appear when LLM proposes updates — each card shows summary of intended changes with Confirm / Cancel / Edit buttons. Cancel discards proposal; Edit lets user adjust before confirming.

### 13. Settings
Tabs: Profile / API Key & Cost / Calendar Feeds / Planning / Data. Each tab self-contained.

## Entity Model (locked)

| Entity | Notes |
|---|---|
| **User** | Email, name, timezone, magic-link auth |
| **UserSettings** | API key (encrypted), cost caps (daily/monthly USD), planning_day_of_week, evening_review_time |
| **Priority** | name, icon (color + style), smart_goal (text), quarterly_strategy (text), weekly_strategy (text), daily_strategy (text), min_minutes_per_week (int), max_minutes_per_week (int), check_in_cadence (set: quarterly/weekly/daily), status (active/paused/archived), position (int), pinned_summary (text), sub_app_url (nullable, post-v1), sub_app_auth_token (nullable, encrypted, post-v1) |
| **PriorityMemory** | priority_id, body (markdown), tags (text array), source (chatbot/user), created_at |
| **PriorityFile** | priority_id, filename, blob_url, mime_type, uploaded_at |
| **Quarter** | user_id, quarter_label (e.g. "Q1 2026"), start_date, end_date, status (active/closed) |
| **QuarterWeekFocus** | quarter_id, priority_id, week_number (1-13), focus_label (text) |
| **Task** | owner_priority_id, title, description, target_date (nullable), time_block_start (nullable), time_block_end (nullable), recurrence (jsonb, nullable), status (open/done/skipped), completed_at |
| **Event** | owner_priority_id, title, description, start_time, end_time, recurrence (nullable), completion (nullable) |
| **CalendarFeedEvent** | source_feed_id, title, start_time, end_time, external_id, last_synced_at — immutable |
| **CalendarFeedConfig** | user_id, source (google/outlook), feed_url, sync_cadence_min, last_synced_at |
| **ChatSession** | user_id, session_type (onboarding/creation/quarter/weekly/daily/master), context_ref (quarter_id/week_start_date/day_date/priority_id), priority_id (nullable, for planning sessions), opened_at, closed_at |
| **ChatMessage** | session_id, role (user/assistant/system), content, tool_calls (jsonb), created_at |

### Entity rules
- Each Task or Event is owned by exactly one Priority
- A Task can become "scheduled" by getting a time_block — type doesn't change
- Events are inherently time-bound; Tasks may or may not be
- CalendarFeedEvents are immutable and unowned — render alongside but never edit
- One Quarter active at a time per user
- Master chat is a single continuous ChatSession per user (session_type='master')
- Soft delete on all user-content tables via `deleted_at` column

### Recurring Tasks and Events

Tasks and Events both support recurrence. v1 supports daily, weekly (with day-of-week selection like "every Monday and Wednesday"), and monthly (with day-of-month like "the 15th of every month") patterns. Yearly is deferred to v1.1.

User-facing behavior:

- **Creating a recurring item**: during planning, the user (or a Priority's planning chatbot) can specify recurrence on a new Task or Event. The recurrence pattern is part of the item — it has an ongoing presence rather than being a one-off.
- **Viewing recurring items**: each occurrence of a recurring item shows up on its expected date in Daily View, Weekly Plan, etc. The user sees them as if they were individual items, even though only the recurring "template" is stored.
- **Completing a single occurrence**: tap the checkbox on a recurring item for a specific date — only that date's instance is marked complete. Future occurrences remain open.
- **Skipping a single occurrence**: mark a specific date's instance as skipped (via master chat or direct UI) — only that date is affected. Future occurrences remain.
- **Modifying a single occurrence**: change a time block or details for one specific date — the change applies only to that date. Future occurrences keep the original template.
- **Editing the template**: change the recurring item itself (e.g., change "Daily walk at 7am" to "Daily walk at 8am"). Future occurrences pick up the change. Past per-instance modifications are preserved.
- **Deleting a recurring item**: removes the template and all its per-instance modifications. Past completed instances stay in history per the Priority deletion cascade rules.

Implementation pattern (template + on-demand override) is in TDD Subsystem 12. From the user's perspective, recurrence "just works" — they create it once and interact with each occurrence as if it were independent.

## Quality Controls

These are non-negotiable v1 UX rules:

- **Master chat ALWAYS shows preview before applying any change.** No silent updates. Even small changes get a preview card with confirm/cancel.
- **Planning sessions are resumable.** If user closes the app mid-session, returning resumes with the queue position and chat state intact.
- **Onboarding is resumable too.** If user exits the Coach interview at any point, returning lands them back where they left off with prior chat history visible. No "discard partial state" path.
- **Re-planning offers two modes.** When the user triggers planning on an already-planned horizon, a mode picker appears (Replan all / Adjust). Replan all confirms before destroying the existing plan.
- **Priority order updates apply only to next planning session.** Reordering the council mid-quarter doesn't retroactively shuffle the current quarter's plan.
- **External calendar feed events always win.** They cannot be overwritten by Priority planning. If a Priority tries to schedule a time block that conflicts with a feed event, the user is told and asked to pick a different time.
- **Conflict resolution feedback is visible.** When Priority B can't claim a time slot because Priority A already did, the user sees a clear note ("Gym wanted 6pm Tuesday but Work has it; suggesting 7pm").
- **Weekly time tracking per Priority is visible.** Priority Detail shows current week's allocated minutes vs the min-max target range. Visual cues show under-target, in-range, over-target. Pure tracking — no hard enforcement during planning.
- **Streaming chat responses always indicate progress.** Spinner / typing indicator while waiting; partial content as it arrives.
- **Cost cap warnings appear in advance.** When the user is at 80% of daily or monthly cap, surface a banner. When cap is hit, AI features pause with clear messaging.
- **Onboarding Coach is fully skippable** at every step. User can always exit and start blank.
- **Data export available anytime** via Settings → Data → Export. JSON file with everything.

## Cost Picture

Estimated monthly Anthropic API spend per usage scenario, with model routing applied (Sonnet for planning chats and master chat where quality matters; Haiku for routing classification, simple summarization, and data transformations).

| Scenario | Monthly cost | Notes |
|---|---|---|
| Light (5 priorities, planning weekly + occasional master chat) | ~$8-12 | Mostly Haiku for routing, Sonnet bursts for planning |
| Active (8 priorities, full Q/W/D ritual + daily master chat) | ~$15-20 | Daily plans drive cost; Sonnet on planning chats |
| Power (12+ priorities, heavy master chat use, large memory bases) | ~$25-35 | Memory grows = more context per call |

Optimization headroom (deferred to v1.1):
- Aggressive prompt caching on Priority memory (~30-40% savings)
- Smart memory summarization to keep context windows bounded
- Routing more master chat ops to Haiku where quality permits

## v1 IN Scope

- Sign up / login (magic link)
- Onboarding Coach chatbot + Council Proposal Review (with mid-interview resume)
- Manual Priority creation flow
- Priority Detail with full editing of structured core (including min/max minutes-per-week range), memory, files
- Weekly time tracking display per Priority (visual: current week vs min-max range)
- Drag-to-reorder council
- Pause / archive Priorities
- Quarter / Weekly / Daily planning sessions (full council walkthrough each)
- Re-planning with two modes (Replan all / Adjust)
- Daily Plan as 3-step evening review (Progress / Capture / Plan tomorrow)
- Master chat with full screen-context awareness, auto-detect, preview, confirm
- Daily View for everyday check-in with task completion
- Calendar feed integration (Outlook + Google via .ics) with auto-sync cron
- Conflict resolution by Priority order during planning
- External calendar events as immovable blocks
- Cost caps (daily + monthly) with circuit breaker
- Soft delete + data export
- Markdown rendering with XSS protection (rehype-sanitize)
- Mobile-first PWA, installable on phone home screen

## v1 OUT Scope (acceptable limitations)

**Functional:**
- No notifications (push or email)
- No offline writes (read-only when offline)
- No bi-directional calendar sync (read-only feeds)
- No voice input
- No advanced visualizations (no Wheel-of-Life-style radar charts, no progress charts beyond per-Priority weekly time tracking)
- No search across council / memory / chat history
- No yearly planning ritual (yearly notes only, attached to Priorities ambiently)
- **Sub-app integration is fully designed in this FDD (Workflow 11) and in `priorities-sub-app-workflow.md` but NOT BUILT in v1.** No "Connect a sub-app" UI in v1; the Priority Detail's sub-app section is absent. First sub-app build (post-v1) triggers actual implementation per the documented spec.
- No trash recovery UI (soft-deleted items recoverable via export)
- No item dedup across sources
- No multi-user / sharing
- No council templates beyond what Onboarding Coach generates
- Minutes-per-week is tracking-only — no hard enforcement during planning (planner will note when out of range but won't refuse)

**Background scheduled jobs except calendar feed sync** — the planner runs only on demand (user-triggered planning sessions). The one cron in v1 is calendar feed sync (every 5 minutes, picks up feeds whose configured cadence has elapsed).

## Success Criteria

v1 is "done" when all of these are true:

1. A new user can sign up, complete the Onboarding Coach interview, accept a proposed council of 5-10 Priorities, and land on a populated Priorities List — all in under 20 minutes.
2. The user can do a Quarter Plan by chatting through their council in order, with each Priority's `quarterly_strategy` driving its part of the conversation, ending with all 13 weeks of the quarter labeled per Priority.
3. The user can do a Weekly Plan that produces Tasks/Events assigned to days of the week, in council order with conflict resolution working.
4. The user can do a Daily Plan that produces a time-blocked tomorrow with calendar feed events as immovable anchors.
5. The user can open Master Chat from any page, type a freeform message, see a preview of intended updates that correctly identifies the affected Priority(ies) using screen context, and confirm to apply.
6. The Daily View renders today's plan correctly with checkable items.
7. Adding/removing/reordering Priorities works, including pause and archive.
8. Calendar feeds sync on cadence and events appear correctly in the day view.
9. Cost caps trigger correctly (test by setting low caps).
10. Data export returns a valid JSON file with all the user's data.
11. The PWA installs on phone home screen and works as a standalone app.

## Resolved Functional Decisions

These were settled during Vision refinement, entity-model lock, and FDD refinement:

- **Routines** fold into a Priority — user creates a Wellbeing or Routines Priority that owns morning/night routine Tasks. No special UX for routines.
- **Yearly horizon** is light notes only attached to Priorities (no separate session). Priority memory holds yearly context naturally.
- **Knowledge base structure** is hybrid: structured core (10 fields including min/max minutes range) + free-form memory (PriorityMemory entries) + attached files (PriorityFile rows).
- **Master chat routing**: LLM auto-detects affected Priority(ies), shows preview, applies on confirmation. Full screen context auto-attached.
- **Onboarding** uses an Onboarding Coach chatbot interview that proposes a starter council; skippable; resumable mid-interview (state saved, returns where you left off).
- **Sub-app contract and UX** are fully designed (Vision + this FDD's Workflow 11 + sub-app workflow doc) but not implemented in v1. Triggers actual implementation when first sub-app gets built.
- **Tasks vs Events** are split entities. Tasks are checkable; Events are time-bound. CalendarFeedEvents are a third separate immutable entity.
- **Quarter length** is 13 weeks, calendar-aligned (Q1=Jan-Mar, etc.). First quarter on signup is partial (covers remaining weeks of current calendar quarter).
- **Priority Memory** is stored as a list of timestamped entries plus a pinned summary on the Priority itself.
- **One quarter active at a time** per user (no per-Priority quarters).
- **Each Task or Event owned by exactly one Priority** — no shared ownership.
- **Check-in cadence** is a multi-select set (any combination of quarterly/weekly/daily) — controls which planning sessions a Priority participates in.
- **Re-planning behavior**: two modes available when planning a partly-planned horizon (Replan all / Adjust). Mode picker appears when triggering planning on already-planned horizon.
- **Minutes per week** is min/max range (two fields), tracked visually per Priority on Priority Detail and during weekly planning. Pure tracking — no hard enforcement.
- **Daily Plan structure**: 3-step evening review (Progress check → Capture → Plan tomorrow). Steps 1 and 2 individually skippable; Step 3 is the only required if user invokes "Plan Tomorrow" directly.
