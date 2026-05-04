# Priorities

> Your priorities, planned by their advocates.

A mobile-first life-management PWA built around a council of priority chatbots and three nested planning horizons (Quarter / Week / Day), plus a master chat router.

**Status:** active build. Current state lives in [PROJECT-STATUS.md](./PROJECT-STATUS.md) — the single source of truth for milestone progress, open items, and known issues. Updated on every meaningful change.

## Stack

- **Framework**: Next.js 15 (App Router) on Vercel
- **Database**: Neon Postgres + Drizzle ORM
- **Auth**: Lucia magic link (via Resend for email delivery)
- **UI**: Tailwind CSS v4 + shadcn/ui patterns + `@dnd-kit/sortable`
- **LLM**: Anthropic SDK (per-user API keys, encrypted at rest)
- **PWA**: `next-pwa` (added in M20)

Full stack rationale: [priorities-tdd.md § Stack](./priorities-tdd.md).

## Repo layout

```
src/
  app/                  # Next.js App Router routes (UI + API)
  components/           # React components
  db/                   # Drizzle schema + Neon client
  auth/                 # Lucia + magic link helpers
  lib/                  # cost, encryption, recurrence, timezone, locks, utils
  prompts/              # 8 verbatim LLM prompts (DO NOT paraphrase)
drizzle/
  migrations/           # numbered, immutable SQL migrations
docs/                   # design package (currently at repo root, see below)
```

The 8 design markdown files (`priorities-*.md`) currently live at the repo root. They are the authoritative reference for product decisions and technical decisions. Reading order is in the [exec summary](./priorities-exec-summary.md).

## Getting started

This project's intended dev loop is **claude.ai/code on phone, Vercel preview URLs, no local desktop dev environment**. See [priorities-tdd.md § Build Approach](./priorities-tdd.md).

Once a Vercel project is connected to this repo:

1. Add environment variables in Vercel (see [.env.example](./.env.example)).
2. Run the initial database migration: `npm run db:migrate` (runs as a Vercel build step once the migrations folder has content — currently empty until M2).
3. Push to `main` → production deploy. Push to any branch → preview URL.

For local dev (if Node.js is available):

```bash
npm install
cp .env.example .env.local   # fill in values
npm run db:migrate
npm run dev
```

## Build order

20 milestones tracked in [PROJECT-STATUS.md](./PROJECT-STATUS.md). End-to-end usable manual life manager at M9 (no AI yet); first AI feature at M12; v1 done at M20.

## Acceptable v1 limitations

Documented in [priorities-tdd.md § Edge Cases & Limitations](./priorities-tdd.md) and mirrored in [PROJECT-STATUS.md](./PROJECT-STATUS.md). They are intentional v1 scope decisions, not bugs.
