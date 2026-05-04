# Priorities — Project Status

> **For Claude Code (and anyone reading the repo): this is the living source of truth for project state.** Update this file every time you make a meaningful change — milestone progress, items resolved, new known issues, phase transitions. Keep entries concise. The "Last Updated" line at the top must be set to the current date on every change.

## Last Updated

2026-05-04 (M3 code complete — owner setup pending)

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
| 3 | User settings + Settings page skeleton | 🔨 | **Code complete; awaiting owner setup + production verification.** Encryption module (`src/lib/encryption.ts`, AES-256-GCM via `node:crypto`), settings data-access (`src/lib/settings.ts`), API route (`src/app/api/settings/route.ts`, GET + POST + PATCH, accepts JSON or form), and UI (`src/app/settings/{layout,page,profile/page,api-key/page,[tab]/page}.tsx` + `SettingsTabs.tsx`) all written. Tab nav shows Profile + API Key as functional and Calendar/Planning/Data as disabled placeholders pointing at M10/M14/M19. Home page got a Settings link. Typecheck passes. **Owner still needs**: (a) apply `drizzle/migrations/0001_user_settings.sql` in Neon's SQL editor, (b) set `API_KEY_ENCRYPTION_KEY` in Vercel (Production + Preview + Development) to the output of `openssl rand -base64 32`. After both, verify via the steps in the M3 plan. |
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

- **Owner setup needed to close M3** (do these in either order; both required before the Settings page works on the preview URL):
  1. **Apply migration**: in Neon's SQL editor, paste and run the contents of `drizzle/migrations/0001_user_settings.sql`. Creates the `user_settings` table.
  2. **Set encryption key**: in Vercel → Project Settings → Environment Variables, add `API_KEY_ENCRYPTION_KEY`. Generate locally with `openssl rand -base64 32` and paste the output. Apply to **Production, Preview, and Development** scopes. Treat this value as immutable for v1 — rotating it forces every user to re-enter their API key.
  3. After both: open the latest preview deploy of `claude/read-prompt-mobile-xyEk8`, sign in, hit `/settings/profile`, then `/settings/api-key`, paste a fake key (`sk-ant-test-deadbeef`), confirm the status flips to "Key saved ✓". In Neon SQL editor, run `SELECT anthropic_api_key FROM user_settings WHERE user_id = '<your usr_*>'` and confirm it stores base64 ciphertext, NOT the plaintext.

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

- **2026-05-04 (M3 code complete on `claude/read-prompt-mobile-xyEk8`)**: First phone session. Built the rest of M3 on top of the existing schema. New files: `src/lib/encryption.ts` (AES-256-GCM via `node:crypto`, base64 envelope `iv||ciphertext||tag`, fail-fast key validation, never logs plaintext), `src/lib/settings.ts` (`getUserSettings`, `getSettingsView`, `getDecryptedAnthropicKey`, `applySettingsPatch` — encryption only at write/decrypt, not on render), `src/app/api/settings/route.ts` (GET + POST + PATCH, accepts JSON for API clients and form-encoded for HTML forms; zod-validated; redirects to `/settings/<tab>?saved=1` on form success), `src/app/settings/{layout,page,profile/page,api-key/page,[tab]/page}.tsx` + `SettingsTabs.tsx` (Profile + API Key functional; Calendar/Planning/Data show as disabled tabs with M10/M14/M19 hints). Home page (`src/app/page.tsx`) gained a Settings link. Encryption round-trip verified locally with random key (round-trip, tamper rejection, short-envelope rejection, missing-key + wrong-length-key error paths). `npm run typecheck` passes clean. `npm run lint` is blocked on a pre-existing project gap (no ESLint config — `next lint` prompts interactively); not introduced by M3. Owner setup (env var + migration) still required before the preview deploy works end-to-end — see Critical section above.
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
