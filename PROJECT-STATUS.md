# Priorities — Project Status

> **For Claude Code (and anyone reading the repo): this is the living source of truth for project state.** Update this file every time you make a meaningful change — milestone progress, items resolved, new known issues, phase transitions. Keep entries concise. The "Last Updated" line at the top must be set to the current date on every change.

## Last Updated

2026-05-05 (M8 code complete — owner verification pending)

## Phase Status

| Phase | State | Notes |
|---|---|---|
| Design | ✅ Complete | All 8 design and reference documents finalized and audited (Vision, FDD, TDD, Project Status, Setup Walkthrough, Sub-App Workflow, Flow Template, Exec Summary). Ready to build. |
| Phase 1 (v1 platform build) | 🔨 In Progress | Started 2026-05-03 with M1 scaffold |
| Phase 2 (sub-app extensions + platform improvements) | 📋 Planned | See Phase 2 Backlog below |

## v1 Build Progress

20-milestone build order from TDD's "Build Order Recommendation" section. Two additive deviations applied (see plan: cost circuit breaker pulled forward to M12; data export added to M19). Status: ⬜ Not started, 🔨 In progress, ✅ Done.

| # | Milestone | Status | Notes |
|---|-----------|--------|-------|
| 1 | Project scaffold (Next.js 15 + Tailwind v4 + Drizzle + Lucia magic link) | ✅ | Verified 2026-05-03 — production URL `priorities-two.vercel.app` returns 200 on `/` and `/api/healthcheck`. Build pipeline working end-to-end: GitHub push → Vercel auto-deploy → preview URL. Lucia v3 dropped during M1 fix; magic link auth in M2 uses custom session management. |
| 2 | Database setup + magic link auth flow (signin, auth callback, signout) | ✅ | Verified 2026-05-03. End-to-end magic link flow works on production (Neon DB live, Resend sending, session cookie persists, sign in + sign out both functional). Schema: `users`, `sessions`, `magic_link_tokens`. Custom session mgmt in `src/auth/`. |
| 3 | User settings + Settings page skeleton | ✅ | Verified 2026-05-04 on production (`priorities-two.vercel.app`). Encryption module (`src/lib/encryption.ts`, AES-256-GCM via `node:crypto`), settings data-access (`src/lib/settings.ts`), API route (`src/app/api/settings/route.ts`, GET + POST + PATCH, accepts JSON or form), and UI (`src/app/settings/{layout,page,profile/page,api-key/page,[tab]/page}.tsx` + `SettingsTabs.tsx`). Tab nav: Profile + API Key functional; Calendar/Planning/Data show as disabled placeholders pointing at M10/M14/M19. Home page has a Settings link. Owner verified end-to-end: home page renders new copy, Profile + API Key tabs render and post saves correctly, fake API key (`sk-ant-test-deadbeef`) round-trips through encryption, Neon SQL confirms stored value is base64 ciphertext (NOT plaintext). `API_KEY_ENCRYPTION_KEY` is set in Vercel for All Environments. Migration `drizzle/migrations/0001_user_settings.sql` applied to Neon. |
| 4 | Priorities table + Council Home (Priorities List) read-only | ✅ | Verified 2026-05-04 on production. `priorities` Drizzle table in `src/db/schema.ts` + migration `drizzle/migrations/0002_priorities.sql` applied to Neon. Read-only data access in `src/lib/priorities.ts`. Council Home at `/priorities` (`src/app/priorities/page.tsx` + `PriorityCard.tsx`). Empty state verified; render-test verified by inserting 3 fake Priorities (Health / Career / Side Project) via Neon SQL — cards rendered with correct color dot, status badge, and minutes/week target. Test data cleared after. Root `/` now redirects authed users to `/priorities`. Out of scope (deferred): drag/CRUD/pause/archive UI (M5), quarter header (M7), planning banners (M11+), last-activity tracking (M8+). |
| 5 | Manual Priority CRUD + drag-to-reorder (@dnd-kit) + pause/archive | ✅ | Verified 2026-05-04 on production. No schema change. CRUD, drag-to-reorder with optimistic UI, pause/resume/archive/reactivate via per-card kebab menu, soft-delete with confirm, "Show archived" toggle, ?archived=1 URL state, 8-color × 4-style icon picker with live "P" preview. `softDeletePriority` has the M8 cascade hook commented in place. Two post-merge bug fixes applied: (a) menu wrapper's close-on-click was racing form submits on React 19 mobile — switched to outside-click detection + `stopPropagation` on submit buttons; (b) "Show archived" link is a soft Next nav, so PrioritiesList's `useState(initial)` was sticky — added a `key` prop on the toggle to force remount. |
| 6 | Priority Detail page with full edit | ✅ | Verified 2026-05-04 on production. Migration `0003_priority_memory_and_files.sql` applied to Neon. Vercel Blob provisioned (`BLOB_READ_WRITE_TOKEN` auto-injected). Detail page at `/priorities/[id]` consolidates the M5 edit form + collapsible Memory + Files sections + Danger zone. Memory: add / edit (inline) / delete with markdown rendering via `react-markdown` + `rehype-sanitize`, comma-separated tags, source badge. Files: multipart upload via `@vercel/blob put()`, public blob URLs, 10MB limit, 9-MIME whitelist, soft-delete row (blob orphan cleanup deferred to v1.1). Pinned summary editable. Old `/priorities/[id]/edit` redirects to detail page. `softDeletePriority` cascades to memory + files via sequential statements (Neon HTTP driver doesn't allow conditional branching inside `db.transaction()`; the original M6 commit used a transaction and broke delete — fixed in `97a1a3e` post-merge). |
| 7 | Quarters table + first-quarter calculation logic + display in Priorities List header | ✅ | Verified 2026-05-05 on production. Migration `drizzle/migrations/0004_quarters.sql` applied to Neon. `quarters` Drizzle table (text id, user_id FK, quarter_label, start_date/end_date as `date`, status active\|closed, is_partial, soft-delete, partial unique index on `(user_id) WHERE status='active' AND deleted_at IS NULL`). `src/lib/quarters.ts`: pure helpers (`currentDateInTz` via `date-fns-tz`, `calendarQuarterBounds`, `weeksInQuarter`, `weekNumber`) + DB-backed `getActiveQuarter` + `ensureCurrentQuarter` (lazy rollover: close + insert sequentially, no transaction since Neon HTTP can't branch on intermediate results). Council Home parallelizes `ensureCurrentQuarter` with the priorities fetch and renders a `Q2 2026 · week N of K (partial)` line under the title. Manual "start new quarter early" + "Plan your new quarter" banner deferred (M11/M14). Verification gotcha (recorded for M11+): Postgres `current_date` evaluates in the DB session timezone (Neon defaults to UTC), so `current_date - 1` does NOT mean "yesterday in the user's local TZ" — use literal date strings when faking dates in test SQL. |
| 8 | Tasks + Events tables + manual CRUD via Priority Detail | 🔨 | **Code complete; awaiting Neon migration + verification.** New: `tasks` + `events` Drizzle tables + `drizzle/migrations/0005_tasks_and_events.sql` (9 partial indexes total: 5 on tasks, 4 on events; both with self-referential `instance_of_*_id` FK for the Subsystem 12 template + override pattern). Recurrence engine in `src/lib/recurrence.ts` (pure helpers `recurrenceIncludesDate`, `materializeVirtualTask`, `materializeVirtualEvent` + virtual id format `virt_<templateId>_<YYYY-MM-DD>`); 25/25 scratch tests pass for daily/weekly-byday/monthly-bymonthday + interval + until edge cases. Data layer: `src/lib/tasks.ts` and `src/lib/events.ts` with `getTasksForPriority`, `getTasksForDate` (M9-ready), `getEventsForPriority`, `getEventsForDateRange` (M9-ready), CRUD + completion helpers, override materialization, and per-priority cascade helpers. `softDeletePriority` cascade in `src/lib/priorities.ts` extended to tasks + events with the past-completed preservation rule (TDD §472-512); old M5 TODO removed. API routes (TDD §440-446 flat namespace): `POST /api/tasks`, `PATCH/DELETE /api/tasks/[id]`, `POST /api/tasks/[id]/complete`, `POST /api/events`, `PATCH/DELETE /api/events/[id]`. Routes accept JSON or form-urlencoded; datetime-local strings converted to UTC via `fromZonedTime(value, session.user.timezone)`. UI: `RecurrenceFields.tsx` (shared sub-form, native `<select>` + 7 weekday checkboxes + bymonthday + until), `TaskForm`/`TaskRow`/`TasksSection` and `EventForm`/`EventRow`/`EventsSection`, plus 4 new pages under `/priorities/[id]/{tasks,events}/{new,[id]/edit}`. Priority Detail page `[id]/page.tsx` wires Tasks + Events sections between the priority form and Memory; TOAST_COPY extended with `task_saved/deleted/completed` and `event_saved/deleted`. Quality pass: `verifyPriorityOwnership` extracted to `src/lib/priority-ownership.ts` (was duplicated in priority-memory.ts + priority-files.ts; M8 needs it twice more in tasks/events). DST limitation noted in `materializeVirtualTask` doc — wall-clock time of virtual instances may shift by 1 hour across a DST boundary; acceptable v1 limitation. Typecheck passes clean. **Owner still needs**: apply `drizzle/migrations/0005_tasks_and_events.sql` in Neon. |
| 9 | Daily View page (today's Tasks + Events, checkboxes, date navigation) | ⬜ | **End-to-end works at this point.** Manual life manager, no AI yet. |
| 10 | Calendar feed config + .ics ingestion + Vercel cron + display in Daily View | ⬜ | Includes `removed_from_source_at` reconciliation logic + Settings → Calendar tab |
| 11 | Quarter Plan UI scaffold (queue + chat + 13-week calendar layout) | ⬜ | Static UI, no chatbot yet |
| 12 | Quarter Planning chatbot per Priority (verbatim Prompt 4) + tool calls + persist quarter_week_focus + cost circuit breaker | ⬜ | First AI feature live. **Deviation 1**: cost circuit breaker primitives (`withinCostCap`, per-message + per-session cost tracking, `chat_sessions.total_cost_usd`) land here, not M19, since TDD §Security requires cap check before every LLM call. UI surfacing stays at M19. Includes `generation_locks` table + tool error handling (validation/concurrency/transient) |
| 13 | Weekly Plan UI + chatbot (Prompt 5) + persist Tasks/Events with target_date | ⬜ | Conflict resolution surfaces inline |
| 14 | Daily Plan UI + chatbot (Prompt 6) — 3-step evening review structure | ⬜ | Progress / Capture / Plan tomorrow + Settings → Planning tab |
| 15 | Re-planning mode picker (Replan all / Adjust) for all three horizons | ⬜ | |
| 16 | Master Chat — preview generation (Prompt 7) + screen context envelope from all relevant pages | ⬜ | Non-streaming structured output + `master_chat` single-flight lock |
| 17 | Master Chat — confirm execution + cancel + persistent history + staleness validation + scrollback pagination | ⬜ | Atomic batch execution; 5-min preview expiry; "Load older" pagination |
| 18 | Onboarding Coach (Prompts 1 + 2) + Council Proposal Review + accept handler + Mid-cycle Priority Onboarding banners (Subsystem 11) | ⬜ | Re-triggerable from Settings with Replace/Add modal |
| 19 | Cost surfacing UI (Settings → Cost & Usage tab) + cost cap banners + Memory Summarization (Subsystem 9, Prompt 8) + Data export (Settings → Data tab) | ⬜ | **Deviation 2**: Data export (acceptance criterion #13) explicitly slotted here |
| 20 | PWA manifest + service worker + polish pass (error states, empty states, loading skeletons, conflict feedback messaging, weekly time tracking display per Priority, markdown XSS audit) | ⬜ | |

## Open Items

### Critical (blocking or near-term)

- **Owner setup needed to close M8**: apply `drizzle/migrations/0005_tasks_and_events.sql` in Neon's SQL editor (creates `tasks` + `events` tables + 9 partial indexes). Then merge feature branch and verify on `priorities-two.vercel.app`.

### Important (next iteration)

- **Lucia v3 dropped from dependencies (2026-05-03).** The maintainer sunset Lucia in late 2024; `@lucia-auth/adapter-postgresql@3.x` has a peer dep on `@neondatabase/serverless@"0.7 - 0.9"` which conflicts with the latest Neon driver and broke the M1 Vercel build. Per the maintainer's official guidance, M2 will implement magic-link + session management directly using `oslo` (crypto primitives — already in deps) + Drizzle (sessions table). No functional change to the plan. TDD §Stack still says "Lucia magic link" — interpret that as "magic link auth, conventionally Lucia-style sessions in DB," not literal Lucia usage.

### Nice-to-have (backlog)

_None yet — populate as issues surface during build._

## Acceptable v1 Limitations (Known Gaps)

These are documented in the TDD as "Edge Cases & Limitations." They are intentional v1 scope decisions, not bugs.

**Functional:**
- No deduplication of Tasks/Events across Priorities
- Plan does not adapt mid-day; static once daily plan is set
- No notifications (push or email)
- No offline writes (read-only when offline)
- No bi-directional calendar sync (read-only .ics ingestion)
- No voice input
- No advanced visualizations (no radar charts, no progress charts beyond per-Priority weekly time tracking)
- No search across council / memory / chat history
- No yearly planning ritual (yearly notes only, attached to Priorities ambiently)
- **Sub-app integration is fully designed in FDD/sub-app workflow doc but NOT IMPLEMENTED in v1.** No "Connect a sub-app" UI in v1.
- No trash recovery UI (soft-deleted items recoverable via export only)
- No multi-user / sharing
- No council templates beyond what Onboarding Coach generates
- Minutes-per-week is tracking-only — no hard enforcement

**Technical/operational:**
- No rate limiting on own API endpoints (single-user v1)
- No formal email verification (magic link is the substitute)
- No user-facing audit log of changes
- No automated tests beyond manual verification
- No formal observability stack (Vercel logs + chat_sessions cost tracking only)
- No edge runtime optimization
- No connection pool tuning beyond Neon serverless defaults
- No master chat undo for confirmed actions (must issue a new master chat command to reverse)
- Council UX optimized for ≤20 active Priorities
- Cost pricing constants in app config may drift from Anthropic's actual pricing
- Encryption key rotation requires manual user action (re-enter API key)

## Phase 2 Backlog

### Sub-app extensions to design (each gets its own design pass)

The first sub-app to get built triggers actual implementation of the sub-app contract per `priorities-sub-app-workflow.md`. Each sub-app is a standalone repo + PWA that plugs into a specific Priority via the documented contract.

Health-domain candidates:
- Gym Coach (sheet music–style training program with periodization)
- Meal Planner (store-aware grocery lists, recipe browser, macro tracking)
- Medical Manager (treatment timelines, prescriptions, appointments)
- Sleep Tracker

Recreation/Creativity candidates:
- Piano Coach (repertoire browser, sheet music references, practice log)
- Vacation Planner (trip itinerary, budget, packing list)
- Hobby Tracker

Relationships candidates:
- Date Planner
- Friends/Family Maintenance

Career, Money, Personal Growth candidates:
- Career Coach
- Budget Tracker
- Reading List Manager

### Platform improvements (post-v1.0)

- Sub-app contract implementation (when first sub-app gets built)
- Real MCP wire format adoption (when portability matters)
- Trash recovery UI for soft-deleted items
- Search across all data
- Master chat undo for confirmed actions
- Smart memory summarization beyond the threshold-based pattern (RAG with vector embeddings)
- Native iOS/Android via React Native (Phase 2 stack rebuild)
- Push notifications
- Item dedup across Priorities
- Bi-directional calendar sync (write back to Outlook/Google via OAuth)
- Yearly horizon visualizations (yearly notes already captured in v1)
- Multi-user / sharing
- Council templates / starter scenarios beyond Onboarding Coach output
- Voice input for master chat
- Formal observability stack (Sentry, Vercel Analytics)
- Automated test suite (unit + integration + e2e)
- Encryption key versioning for graceful rotation
- Connection pool tuning if scale demands
- Edge runtime optimization for cold-start latency

## Recent Changes

Most recent at the top. Each entry: date + summary. Keep concise.

- **2026-05-05 (M8 code complete on `claude/read-prompt-mobile-xyEk8`)**: Tasks + Events schema + Subsystem 12 recurrence engine + manual CRUD on Priority Detail. New `tasks` + `events` Drizzle tables in `src/db/schema.ts` with self-referential `instance_of_*_id` FKs and 9 partial indexes; matching DDL in `drizzle/migrations/0005_tasks_and_events.sql`. Pure recurrence math in `src/lib/recurrence.ts` (daily/weekly-byday/monthly-bymonthday/interval/until) — 25 scratch test cases all pass including Feb 31 → no, weekly across week boundaries, monthly with interval=2. Data layer: `src/lib/tasks.ts` + `src/lib/events.ts` with priority-scoped reads, date-scoped reads (M9-ready, expand templates → virtual instances with synthetic `virt_<id>_<date>` IDs), CRUD, completion helpers, override materialization, and per-priority cascade helpers (preservation rule encoded in raw SQL with `target_date < CURRENT_DATE`-style predicates). `softDeletePriority` cascade extended; M5 TODO cleared. API: 5 new routes under `/api/tasks` and `/api/events` (flat per TDD §440-446) accepting JSON or form; datetime-local strings converted to UTC via `fromZonedTime(value, session.user.timezone)`. UI: 7 new components (RecurrenceFields shared sub-form, TaskForm/Row/Section, EventForm/Row/Section) + 4 new pages under `/priorities/[id]/{tasks,events}/{new,[id]/edit}`. Priority Detail wires both sections between priority form and Memory; TOAST_COPY extended. Quality pass: extracted `verifyPriorityOwnership` to `src/lib/priority-ownership.ts` (was duplicated in M6's priority-memory.ts + priority-files.ts). DST caveat noted in `materializeVirtualTask` doc.
- **2026-05-05 (M7 verified ✅)**: Owner ran `0004_quarters.sql` in Neon and merged `claude/read-prompt-mobile-xyEk8` to main. Production header on `/priorities` shows `Q2 2026 · week 1 of 9 (partial)` (or close to it depending on day) and `ensureCurrentQuarter` is idempotent across refreshes. Quarter row created in Neon with `start_date = '2026-05-05'`, `end_date = '2026-06-30'`, `is_partial = true`. The "rollover sim" SQL in my Step 4 verify message had a timezone bug (`current_date - 1` runs in UTC on Neon, not the user's local TZ; at PT afternoon it equals today in user TZ, not yesterday) — code is correct, instructions were not. Recorded in the M7 status row so future milestone verifications use literal dates. M7 PROJECT-STATUS flip committed straight to `main`.
- **2026-05-05 (M7 code complete on `claude/read-prompt-mobile-xyEk8`)**: Quarters table + ensureCurrentQuarter helper + Council header display. New `quarters` table in `src/db/schema.ts` with the partial unique-active index expressed via Drizzle `uniqueIndex().where(sql\`...\`)`; matching DDL `drizzle/migrations/0004_quarters.sql`. New `src/lib/quarters.ts` with pure date helpers (calendar-quarter bounds, weeks-in-quarter, week-number; UTC normalization to avoid local-time gotchas) and DB helpers (`getActiveQuarter`, `ensureCurrentQuarter` — lazy rollover via close-then-insert; no `db.transaction()` per the M6 cascade lesson). Council Home gains a one-line header `Q2 2026 · week N of K (partial)` between the title and the email. `Promise.all` parallelizes the priority fetch and the quarter ensure. `npm run typecheck` passes clean.
- **2026-05-04 (M6 verified ✅ on production)**: Owner applied migration `0003_priority_memory_and_files.sql` and provisioned Vercel Blob (auto-created `BLOB_READ_WRITE_TOKEN`). Feature branch fast-forward merged to `main` (`297c5c1..f055ccd`); follow-up bug fix `97a1a3e` rewrote the cascade soft-delete from a `db.transaction()` (which the Neon HTTP driver can't branch on) to three sequential statements. Verified end-to-end: open detail page; add / edit / delete memory entries with markdown rendering; upload + delete files; reject too-large and bad-mime uploads; cascade-delete confirmed via Neon SQL. M6 → ✅.
- **2026-05-04 (M6 code complete on `claude/read-prompt-mobile-xyEk8`)**: Priority Detail page with full edit + memory CRUD + file uploads (Vercel Blob). New tables `priority_memory` + `priority_files` in `src/db/schema.ts`; matching migration `drizzle/migrations/0003_priority_memory_and_files.sql`. New libs `src/lib/priority-memory.ts` (CRUD + ownership verify via priority join) and `src/lib/priority-files.ts` (CRUD + `isBlobConfigured()` helper). API routes for memory (`POST /api/priorities/[id]/memory`, `POST/PATCH/DELETE /api/priorities/[id]/memory/[mid]`) and files (`POST /api/priorities/[id]/files` with `@vercel/blob put()`, `POST/DELETE /api/priorities/[id]/files/[fid]`). Validation extended with `CreateMemorySchema`/`UpdateMemorySchema`, `formDataToMemoryPayload` (parses comma-separated tags), `MAX_FILE_BYTES`/`ALLOWED_MIME_TYPES`/`isAllowedMime`, plus `pinnedSummary` field added to base priority schemas. UI: new `/priorities/[id]/page.tsx` (server component) with toast layer + collapsible `<details>` sections (Edit fields / Memory / Files / Danger zone); `MemorySection.tsx` (server) renders the Add form + list of `MemoryEntry.tsx` (client, inline edit toggle, markdown rendering via `react-markdown` + `rehype-sanitize`); `FilesSection.tsx` (server) shows multipart upload form or "Blob not configured" placeholder + file list with delete. Old `/priorities/[id]/edit` becomes a redirect; SortablePriorityCard kebab "Edit" → "Open" link target updated. `softDeletePriority` now cascades via `db.transaction()` to soft-delete `priority_memory` + `priority_files` rows. `@vercel/blob` added to deps. `npm run typecheck` passes clean.
- **2026-05-04 (M5 verified ✅ on production)**: Direct-merged `claude/read-prompt-mobile-xyEk8` to `main` (`7e7d1a2..f4fd7a4`). Two follow-up bug fixes pushed straight to main: (a) `1c9ad74` — kebab menu wrapper's `onClick={setMenuOpen(false)}` was racing form submits on React 19 mobile so all kebab actions silently failed; switched to outside-click detection via `useRef`/`useEffect` plus `stopPropagation` on the submit buttons; (b) `8141c9e` — "Show archived" link is a Next `<Link>` that soft-navigates, so PrioritiesList's `useState(initial)` stayed at its first-mount value and showed the empty state even when the count above said "1 Priority (including archived)"; added a `key` prop that flips with the toggle to force a remount. Owner verified end-to-end: Create / Edit / Reorder (drag) / Pause↔Resume / Archive↔Reactivate / Show↔Hide archived / Delete-with-confirm. M5 → ✅.
- **2026-05-04 (M5 code complete on `claude/read-prompt-mobile-xyEk8`)**: First fully interactive milestone. CRUD + drag-to-reorder + pause/archive on Priorities. No schema change — pure UI + API on top of M4's table. New files: `src/lib/priorities.ts` extended with `createPriority`/`updatePriority`/`softDeletePriority`/`reorderPriorities`; new `src/lib/priorities-validation.ts` (zod schemas, form parsing, preset palette of 8 colors and 4 letter styles); API routes `POST /api/priorities`, `PATCH+DELETE /api/priorities/[id]`, `POST /api/priorities/reorder`, all dual JSON/form-urlencoded; Create + Edit full-page routes at `/priorities/new` and `/priorities/[id]/edit`; client components `PriorityForm.tsx`, `IconPicker.tsx` (live "P" preview), `PrioritiesList.tsx` (DnD context with optimistic-UI reorder + rollback toast), `SortablePriorityCard.tsx` (kebab menu wraps the read-only `PriorityCard`), `DeleteForm.tsx` (confirm dialog). `PriorityCard` upgraded from color dot to styled "P" letter. Council Home now supports `?archived=1` toggle, success/error toast via redirect query params, and a Create Priority CTA. `softDeletePriority` leaves a `// TODO M8` comment for the Tasks/Events cascade. `npm run typecheck` passes clean.
- **2026-05-04 (M4 verified ✅ on production)**: Migration `0002_priorities.sql` applied to Neon. Feature branch fast-forward merged to `main` (`60dd364..ec08d34`) and deployed to `priorities-two.vercel.app`. Owner verified: empty state renders with honest M5-deferred copy; render-test by inserting 3 fake Priorities (Health green / Career blue / Side Project amber-paused) via Neon SQL produced correctly-rendered cards (color dot, name, status badge, minutes/week target). Test data cleared after. Root `/` redirect to `/priorities` works; Settings + Sign out still functional from the Council header. M4 → ✅.
- **2026-05-04 (M4 code complete on `claude/read-prompt-mobile-xyEk8`)**: Priorities table + read-only Council Home. New: `priorities` Drizzle table in `src/db/schema.ts` (full TDD spec: id, user_id, name, icon (jsonb), strategies, min/max minutes/week, check_in_cadence (text[]), status, position, pinned_summary, sub_app_* nullable, soft-delete, timestamps), matching SQL migration `drizzle/migrations/0002_priorities.sql` with two partial indexes (`(user_id, position)` and `(user_id, status)`, both `WHERE deleted_at IS NULL`). Read-only data access in `src/lib/priorities.ts` (`getPrioritiesForUser` orders by position, filters soft-deleted). Council Home page at `/priorities` (`src/app/priorities/page.tsx`) renders email + Settings + Sign out header, then either an empty state or a list of `PriorityCard` components (color dot + name + status badge + minutes/week target). Honest empty-state copy that doesn't promise an M5-only Create button. Root `/` updated to redirect authed users to `/priorities` (unauthed still to `/signin`). Subsystem 1 (Council Management) seeded but read-only — drag/CRUD/pause/archive deferred to M5; quarter header to M7; planning banners to M11+; last-activity to M8+. `npm run typecheck` passes clean.
- **2026-05-04 (M3 verified ✅ on production)**: Owner applied the `0001_user_settings.sql` migration in Neon and set `API_KEY_ENCRYPTION_KEY` in Vercel (All Environments). Feature branch `claude/read-prompt-mobile-xyEk8` fast-forward merged to `main` (`536d36b..36a4d14`) and deployed to `priorities-two.vercel.app`. End-to-end verification on phone: home page renders new M3 copy with Settings button; Profile + API Key tabs render and submit; saving a fake key flips status to "Key saved ✓"; Neon SQL `SELECT length(anthropic_api_key), left(anthropic_api_key, 8) FROM user_settings` confirms the stored value is base64 ciphertext (not the plaintext `sk-ant-t...` prefix); disabled Calendar/Planning/Data tabs show with M10/M14/M19 hints. M3 → ✅. CLAUDE.md gained a phone-friendly-format rule for owner-facing setup steps.
- **2026-05-04 (M3 code complete on `claude/read-prompt-mobile-xyEk8`)**: First phone session. Built the rest of M3 on top of the existing schema. New files: `src/lib/encryption.ts` (AES-256-GCM via `node:crypto`, base64 envelope `iv||ciphertext||tag`, fail-fast key validation, never logs plaintext), `src/lib/settings.ts` (`getUserSettings`, `getSettingsView`, `getDecryptedAnthropicKey`, `applySettingsPatch` — encryption only at write/decrypt, not on render), `src/app/api/settings/route.ts` (GET + POST + PATCH, accepts JSON for API clients and form-encoded for HTML forms; zod-validated; redirects to `/settings/<tab>?saved=1` on form success), `src/app/settings/{layout,page,profile/page,api-key/page,[tab]/page}.tsx` + `SettingsTabs.tsx` (Profile + API Key functional; Calendar/Planning/Data show as disabled tabs with M10/M14/M19 hints). Home page (`src/app/page.tsx`) gained a Settings link. Encryption round-trip verified locally with random key (round-trip, tamper rejection, short-envelope rejection, missing-key + wrong-length-key error paths). `npm run typecheck` passes clean. `npm run lint` is blocked on a pre-existing project gap (no ESLint config — `next lint` prompts interactively); not introduced by M3.
- **2026-05-03 (M2 verified)**: End-to-end magic-link sign in works on production. M2 → ✅. CLAUDE.md added at repo root for future-session context.
- **2026-05-03 (M2 code complete)**: Magic link auth + first DB tables. Schema: `users` / `sessions` / `magic_link_tokens` (`src/db/schema.ts`). Hand-written initial migration: `drizzle/migrations/0000_init_auth.sql`. Custom session mgmt in `src/auth/` (sessions, magic-link, cookie, public API). Resend wrapper in `src/lib/email.ts`. Routes: `/signin`, `/api/auth/magic-link`, `/api/auth/callback`, `/api/auth/signout`. Home `/` now redirects to `/signin` if not authed. Removed `oslo` from deps (using Node's built-in `crypto`).
- **2026-05-03 (M1 verified)**: Production URL `priorities-two.vercel.app` returns 200 on `/` and `/api/healthcheck`. M1 complete.
- **2026-05-03 (M1 fix)**: Removed `lucia` and `@lucia-auth/adapter-postgresql` from package.json — the adapter's peer-dep range broke the first Vercel build and Lucia v3 was sunset by its maintainer in late 2024. M2 rolls session management directly per Lucia's official sunset migration guidance.
- **2026-05-03 (M1 scaffold)**: Project scaffolded as Next.js 15 + Tailwind v4 + Drizzle + Lucia + shadcn-style utilities. Created `package.json` (deps from TDD §Stack package list), `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `drizzle.config.ts`, `.env.example`, `.gitignore`. Initial folder layout: `src/app/`, `src/db/`, `src/lib/`, plus stub `src/db/schema.ts` (populated milestone-by-milestone) and `src/db/client.ts` (Neon serverless). Created `src/lib/utils.ts` (cn helper) and `src/lib/id.ts` (`<prefix>_<nanoid(16)>` helper). Initial routes: `/` placeholder home + `/api/healthcheck`. README rewritten as project README pointing at design docs and PROJECT-STATUS. Git repo initialized. **Deviation tracking**: cost circuit breaker pulled forward to M12 (TDD §Security requires it before any LLM call); data export added to M19 (acceptance criterion #13).

- **2026-05-03 (final audit)**: Comprehensive cross-doc audit pass. Findings resolved:
  - Removed 3 stale "to be created/regenerated" notes from Exec Summary's Document Map (project-status, flow-template, sub-app-workflow are all created).
  - Fixed entity count: 12 → 13 entities (FDD entity model).
  - Fixed table count: 14 → 16 tables (TDD schema, after gap fixes added `magic_link_tokens` and `sessions`).
  - Added a "Recurring Tasks and Events" functional description to the FDD.
  - All other consistency checks passed.

- **2026-05-03**: Initial design package complete for Priorities. 8 documents finalized. Highlights:
  - Major paradigm shift from prior "Tend" design (Wheel-of-Life domains + agent contract) to Priorities (council of priority chatbots + three-horizon planning ritual).
  - Vision locked with 11 architectural decisions.
  - FDD locked with 11 workflows, 13 pages, 13 entities, 12 quality controls, 15 resolved decisions.
  - TDD hardened with 8 critical gap fixes plus 8 smaller hardening additions across Subsystems 1, 4, 5, 6, 7, 9, 10, 11, 12 plus Database Migrations section.
  - Total tables in TDD schema: 16. Total verbatim prompts: 8. Total subsystems: 12.
