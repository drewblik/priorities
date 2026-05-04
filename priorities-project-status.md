# Priorities — Project Status

> **For Claude Code (and anyone reading the repo): this is the living source of truth for project state.** Update this file every time you make a meaningful change — milestone progress, items resolved, new known issues, phase transitions. Keep entries concise. The "Last Updated" line at the top must be set to the current date on every change.

## Last Updated

2026-05-03

## Phase Status

| Phase | State | Notes |
|---|---|---|
| Design | ✅ Complete | All 8 design and reference documents finalized and audited (Vision, FDD, TDD, Project Status, Setup Walkthrough, Sub-App Workflow, Flow Template, Exec Summary). Ready to build. |
| Phase 1 (v1 platform build) | ⏳ Not Started | Awaits initial Claude Code handoff; first milestone is project scaffold |
| Phase 2 (sub-app extensions + platform improvements) | 📋 Planned | See Phase 2 Backlog below |

## v1 Build Progress

20-milestone build order from TDD's "Build Order Recommendation" section. Status: ⬜ Not started, 🔨 In progress, ✅ Done.

| # | Milestone | Status | Notes |
|---|-----------|--------|-------|
| 1 | Project scaffold (Next.js 15 + Tailwind + Drizzle + Lucia magic link) | ⬜ | Should result in deployable empty app on Vercel preview URL. Copy `priorities-project-status.md` into repo as `PROJECT-STATUS.md` during this milestone. |
| 2 | Database setup + magic link auth flow (signin, auth callback, signout) | ⬜ | Includes `magic_link_tokens` table, Resend integration |
| 3 | User settings + Settings page skeleton | ⬜ | Tabs, profile tab, API key tab with encryption |
| 4 | Priorities table + Council Home (Priorities List) read-only | ⬜ | Static list display first |
| 5 | Manual Priority CRUD + drag-to-reorder (@dnd-kit) + pause/archive | ⬜ | Optimistic UI on reorder |
| 6 | Priority Detail page with full edit | ⬜ | All structured core fields, memory entries CRUD, file uploads |
| 7 | Quarters table + first-quarter calculation logic + display in Priorities List header | ⬜ | Includes Subsystem 10 middleware (auto-transition) |
| 8 | Tasks + Events tables + manual CRUD via Priority Detail | ⬜ | Foundation for planning to populate later. Includes `instance_of_*_id` columns and recurrence schema. |
| 9 | Daily View page (today's Tasks + Events, checkboxes, date navigation) | ⬜ | **End-to-end works at this point.** Manual life manager, no AI yet. |
| 10 | Calendar feed config + .ics ingestion + Vercel cron + display in Daily View | ⬜ | Includes `removed_from_source_at` reconciliation logic |
| 11 | Quarter Plan UI scaffold (queue + chat + 13-week calendar layout) | ⬜ | Static UI, no chatbot yet |
| 12 | Quarter Planning chatbot per Priority (verbatim Prompt 4) + tool calls + persist quarter_week_focus | ⬜ | First AI feature live |
| 13 | Weekly Plan UI + chatbot (Prompt 5) + persist Tasks/Events with target_date | ⬜ | |
| 14 | Daily Plan UI + chatbot (Prompt 6) — 3-step evening review structure | ⬜ | Progress / Capture / Plan tomorrow |
| 15 | Re-planning mode picker (Replan all / Adjust) for all three horizons | ⬜ | |
| 16 | Master Chat — preview generation (Prompt 7) + screen context envelope from all relevant pages | ⬜ | |
| 17 | Master Chat — confirm execution (action handlers for each ProposedAction type) + cancel + persistent history + staleness validation + scrollback pagination | ⬜ | |
| 18 | Onboarding Coach (Prompts 1 + 2) + Council Proposal Review + accept handler + Mid-cycle Priority Onboarding banners (Subsystem 11) | ⬜ | |
| 19 | Cost surfacing (Settings → Cost & Usage tab) + cost cap banners + circuit breaker integration with all AI calls + Memory Summarization (Subsystem 9, Prompt 8) | ⬜ | |
| 20 | PWA manifest + service worker + polish pass (error states, empty states, loading skeletons, conflict feedback messaging, weekly time tracking display per Priority) | ⬜ | |

## Open Items

### Critical (blocking or near-term)

_None yet — populate as issues surface during build._

### Important (next iteration)

_None yet — populate as issues surface during build._

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

- **2026-05-03 (final audit)**: Comprehensive cross-doc audit pass. Findings resolved:
  - Removed 3 stale "to be created/regenerated" notes from Exec Summary's Document Map (project-status, flow-template, sub-app-workflow are all created).
  - Fixed entity count in this doc: 12 → 13 entities (FDD entity model).
  - Fixed table count in this doc: 14 → 16 tables (TDD schema, after gap fixes added `magic_link_tokens` and `sessions`).
  - Added a "Recurring Tasks and Events" functional description to the FDD — previously recurrence was only mentioned as a schema field but not user-facing behavior. Now describes creating, viewing, completing, skipping, modifying, editing, and deleting recurring items from the user's perspective.
  - All other consistency checks passed: cost figures ($15-20/month), milestone count (20), workflows (11), pages (13), quality controls (12), resolved decisions (15), subsystems (12), prompts (8), acceptance criteria (17), architectural decisions (11). Tend/Wheel-of-Life references all intentional historical context.

- **2026-05-03**: Initial design package complete for Priorities. 8 documents finalized. Highlights:
  - Major paradigm shift from prior "Tend" design (Wheel-of-Life domains + agent contract) to Priorities (council of priority chatbots + three-horizon planning ritual).
  - Vision locked with 11 architectural decisions including: hybrid Priority knowledge base, master chat auto-detect-and-confirm, master chat full screen awareness, routines fold into Priorities, yearly horizon as light notes, Onboarding Coach for first-run, sub-app contract documented but not implemented.
  - FDD locked with 11 workflows, 13 pages, full entity model (13 entities), 12 quality controls, 15 resolved functional decisions.
  - TDD hardened with 8 critical gap fixes plus 8 smaller hardening additions:
    - Subsystem 9: Priority Memory Management (auto-summarization at 50-entry threshold) + Prompt 8 (memory summarization)
    - Subsystem 10: Quarter Lifecycle (middleware-based auto-transition)
    - Subsystem 11: Mid-cycle Priority Onboarding (3-banner opt-in pattern)
    - Subsystem 12: Recurrence Engine (template + on-demand override pattern, schema additions for `instance_of_*_id`)
    - Subsystem 5 expanded: Master Chat preview staleness validation + chat scrollback pagination
    - Subsystem 4 expanded: Tool execution failure handling (validation/concurrency/transient)
    - Subsystem 1 expanded: Priority deletion selective cascade + file upload limits + drag-to-reorder optimistic UI
    - Subsystem 6 expanded: Calendar Feed Sync reconciliation (`removed_from_source_at` for past-removed events)
    - Subsystem 7 expanded: Magic link replay protection + Resend specifics + `magic_link_tokens` schema
    - Database Migrations section added (Drizzle Kit workflow)
    - Acceptable limitations expanded: master chat undo, council UX scaling, cost pricing drift, encryption key rotation
  - Total tables in TDD schema: 16. Total verbatim prompts: 8. Total subsystems: 12.
