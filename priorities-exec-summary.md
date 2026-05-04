# Priorities — Executive Summary

> Your priorities, planned by their advocates.

## The Idea

Priorities is a mobile-first PWA for planning life by sequentially conversing with a council of priority chatbots across three nested time horizons (quarterly, weekly, daily), with a master chat router for ad-hoc capture throughout the day.

You build a council of Priorities — one chatbot persona per area of life that matters (Gym, Nutrition, Work, Piano, Car Maintenance, Wellbeing, etc.). Each Priority has a structured core (SMART goal, planning strategies for each horizon, min/max minutes-per-week, check-in cadence) plus free-form memory the chatbot reads from and updates over time. When it's time to plan, you go through the council in user-defined order; the order determines which Priority gets to claim calendar time first (drag-to-reorder = conflict resolution). Throughout the day, the master chat lets you say things in natural language and have the right Priority updated automatically (with a confirmation preview before any change applies).

V1 ships the platform itself. Sub-app extensions (for Priorities that want serious computational depth — Piano with sheet music analysis, Meal Planner with store-aware grocery lists) are documented but not implemented in v1.

## How It Works

Priorities centers on three planning rituals plus an always-available master chat:

1. **Quarter Plan** (every 13 weeks, calendar-aligned): walk through your council in order, each Priority labels weeks with its focus
2. **Weekly Plan** (typically Sunday night or Saturday morning): each Priority assigns tasks/events to days
3. **Daily Plan** (each evening, 3-step review): progress check → capture → time-block tomorrow
4. **Master Chat** (anytime): say "skipping gym tomorrow" or "added Chopin to my repertoire" — LLM auto-detects affected Priority(ies), shows preview, applies on confirmation

A new user goes through an Onboarding Coach interview (10-15 min) that proposes a starter council of 5-10 Priorities with pre-populated knowledge bases. Skippable.

## Differentiation

- **Council pattern** — each Priority is a chatbot with personality, knowledge, and opinion. Fundamentally different from flat task managers.
- **Order-as-conflict-resolution** — drag a Priority up; it claims calendar time first. Lower-priority Priorities can't overwrite. Explicit, editable, never implicit.
- **Three nested horizons, same ritual** — Quarter, Week, Day all use the same UI shape. Pattern compounds: well-planned quarter makes weekly planning faster, etc.
- **Bidirectional ad-hoc capture** — master chat acts as a router, freeing you from doing structured planning every time something changes mid-day.

## Stack & Cost

**Stack**: Next.js 15 (App Router) + Vercel + Neon Postgres + Drizzle ORM + Lucia (magic link auth) + Tailwind v4 + shadcn/ui + @dnd-kit + Anthropic API + Resend (email).

**Build environment**: Claude Code on the web (claude.ai/code) — covered by your Claude Max subscription. GitHub for version control, Vercel for auto-deploy and preview URLs that render on phone.

**Cost**: approximately **$15-20/month** in Anthropic API spend for active personal use, with model routing applied (Sonnet for planning chats and master chat; Haiku for routing/classification/memory summarization). Other infra (Vercel, Neon, Resend) is free at personal scale. Initial setup needs $20 in Anthropic API credits.

## Strategic Play

The moat is twofold: the planning ritual itself (specific flow of council-by-priority-by-horizon, hard to replicate well) and the per-user knowledge bases that grow inside each Priority over time (a Piano priority that knows your repertoire and weak spots is not portable). Both compound with use. V1 stays personal-but-shareable; design choices keep the door open for the council pattern to become a real product, monetization deferred.

## Status

Design phase complete. All documents ready to ship to Claude Code.

## Document Map

| Document | Audience | Purpose |
|---|---|---|
| `priorities-vision.md` | Owner; product/strategy reference | Why Priorities exists, what's defensible, future roadmap, all major strategic + architectural decisions captured with rationale |
| `priorities-fdd.md` | Claude Code + owner; product validation | What Priorities does for the user — 11 workflows, 13 pages, locked entity model, quality controls, cost picture, v1 in/out scope, success criteria, 15 resolved functional decisions |
| `priorities-tdd.md` | Claude Code (build agent) | How Priorities is built — full Next.js 15 stack, complete SQL schemas with indexes, all UI routes, 12 subsystems with code patterns, 8 verbatim LLM prompts, security & data safety, concurrency model, timezone handling, database migrations, error handling, 20-step build order, 17-item acceptance criteria |
| `priorities-project-status.md` | Claude Code + owner (living doc) | Tracking sheet that lives in the repo as `PROJECT-STATUS.md`. Tracks build progress, open items, known limitations, recent changes. Claude Code is required to keep this updated. |
| `priorities-setup-walkthrough.md` | Owner | Practical "what you do next" sequence — account setup, first handoff to Claude Code, infrastructure wiring, the iteration loop, end-to-end timeline from this chat to MVP |
| `priorities-flow-template.md` | Owner (use during whiteboarding) | Reference doc for sketching user flows IRL — 24-flow prioritized checklist organized in 5 tiers, capture template per flow, journey template, instructions for what to send back to Claude. |
| `priorities-sub-app-workflow.md` | Owner (use when designing future sub-apps) | The 7-phase sequence for designing, building, and integrating each new sub-app extension to a Priority. Includes full contract spec (4 endpoints with JSON schemas). Sub-apps are documented but not implemented in v1 — this doc serves as the spec for when the first sub-app actually gets built post-v1. |
| `priorities-exec-summary.md` | New context; navigation | This document — short overview pointing at the others |

## For the Build

**Hand over the TDD, the FDD, and the project status doc to Claude Code.** The TDD is authoritative for technical decisions (stack, schema, prompts, code patterns, build order). The FDD is supporting context for UX decisions when the TDD doesn't specify literally (user journey, page surfaces, scope boundaries). The project status doc gets copied into the repo as `PROJECT-STATUS.md` and maintained going forward. The Vision, Setup Walkthrough, Flow Template, Sub-App Workflow, and Exec Summary are for the owner's reference and do not need to go to Claude Code.

Start with the Setup Walkthrough doc for the practical first-day sequence.
