# Priorities — Project Status

> **For Claude Code (and anyone reading the repo): this is the living source of truth for project state.** Update this file every time you make a meaningful change — milestone progress, items resolved, new known issues, phase transitions. Keep entries concise. The "Last Updated" line at the top must be set to the current date on every change.

## Last Updated

2026-05-03 (M2 in progress)

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
| 2 | Database setup + magic link auth flow (signin, auth callback, signout) | 🔨 | Code complete 2026-05-03. Schema: `users`, `sessions`, `magic_link_tokens` (see `src/db/schema.ts`). SQL migration: `drizzle/migrations/0000_init_auth.sql`. Custom session mgmt (no Lucia) in `src/auth/` — sessions DB id = `sha256(token).hex()` (Lucia post-sunset pattern; one intentional deviation from `<prefix>_<nanoid>` convention, justified by security). 30-day session TTL with sliding renewal. 15-min magic link TTL with single-use replay protection (atomic `used_at` flip). Resend wrapper in `src/lib/email.ts`. Routes: `/signin`, `/api/auth/magic-link`, `/api/auth/callback`, `/api/auth/signout`. Awaits owner setup (Neon DB + Resend API key + env vars + apply migration + push) before verification. |
| 3 | User settings + Settings page skeleton | ⬜ | Tabs, profile tab, API key tab with AES-GCM encryption |
| 4 | Priorities table + Council Home (Priorities List) read-only | ⬜ | Static list display first |
| 5 | Manual Priority CRUD + drag-to-reorder (@dnd-kit) + pause/archive | ⬜ | Optimistic UI on reorder; selective-cascade soft-delete |
| 6 | Priority Detail page with full edit | ⬜ | All structured core fields, memory entries CRUD, file uploads |
| 7 | Quarters table + first-quarter calculation logic + display in Priorities List header | ⬜ | Includes Subsystem 10 `ensureCurrentQuarter` middleware |
| 8 | Tasks + Events tables + manual CRUD via Priority Detail | ⬜ | Foundation for planning to populate later. Includes `instance_of_*_id` columns and recurrence schema (Subsystem 12) + read-side helpers |
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

- **Owner setup needed to close M2**:
  1. Create a Neon Postgres database. Copy the **pooled** connection string (looks like `postgresql://...neon.tech/neondb?sslmode=require`).
  2. Create a Resend account, get an API key. For now use Resend's `onboarding@resend.dev` sender (no domain verification needed). Set `EMAIL_FROM` in Vercel to `Priorities <onboarding@resend.dev>`.
  3. In Vercel project Settings → Environment Variables, set `DATABASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, and `NEXT_PUBLIC_SITE_URL` (set to your production URL, e.g., `https://priorities-two.vercel.app`).
  4. In Neon's SQL editor, paste and run the contents of `drizzle/migrations/0000_init_auth.sql`. This creates the `users`, `sessions`, `magic_link_tokens` tables.
  5. Push the M2 commit. Vercel auto-rebuilds with the new env vars.
  6. Verify: visit `/signin`, enter your email, check inbox, click link, land on `/` showing your email.
  7. `API_KEY_ENCRYPTION_KEY` (`openssl rand -base64 32`) and `CRON_SECRET` are in `.env.example` but not needed until M3 / M10 — can defer.

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

- **2026-05-03 (M2 code complete)**: Magic link auth + first DB tables. Schema: `users` / `sessions` / `magic_link_tokens` (`src/db/schema.ts`). Hand-written initial migration: `drizzle/migrations/0000_init_auth.sql`. Custom session mgmt in `src/auth/` (sessions, magic-link, cookie, public API). Resend wrapper in `src/lib/email.ts`. Routes: `/signin`, `/api/auth/magic-link`, `/api/auth/callback`, `/api/auth/signout`. Home `/` now redirects to `/signin` if not authed. Removed `oslo` from deps (using Node's built-in `crypto`). Awaiting owner setup of Neon + Resend + env vars.
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
