# Claude Code — Project Context

> Auto-loaded into every Claude Code session in this repo. Keep concise.

## What this is

**Priorities** — mobile-first life-management PWA. Council of priority chatbots + three nested planning horizons (Quarter / Week / Day) + master chat router. Greenfield build, started 2026-05-03.

## Read these first

- [PROJECT-STATUS.md](./PROJECT-STATUS.md) — **the single source of truth for project state.** Always read this before doing anything. Update it after every meaningful change.
- [priorities-tdd.md](./priorities-tdd.md) — authoritative for technical decisions (stack, schema, prompts, build order, acceptance criteria).
- [priorities-fdd.md](./priorities-fdd.md) — supporting product/UX context. Only consult when the TDD is ambiguous.

## Where we are right now

Mid-build. See `PROJECT-STATUS.md § v1 Build Progress` for milestone-by-milestone status. The "Open Items → Critical" section names what the owner needs to do next to unblock progress.

## Build approach (per TDD § Build Approach)

- Owner does **not** have a desktop dev environment; everything happens via Claude Code (web at claude.ai/code or the desktop app) connected to GitHub. Vercel auto-deploys every push. Test on phone via preview URL.
- **Phone-friendly format for everything outside Claude Code.** Any task the owner has to perform in another tool (Neon SQL editor, Vercel dashboard, Resend, GitHub UI, third-party services) must be written for a phone: tap-by-tap navigation with the actual menu/button names, every block of SQL or config in a single fenced code block (so it's tap-and-hold to copy), a quick verification step at the end, and a "if something goes wrong" troubleshooting section. If a step needs a value the owner can't easily generate on a phone (random keys, hashes, etc.), generate it in the Claude Code session and give them the literal value to paste.
- **Always start with plan mode** on first handoff and on any complex change. Owner reviews plan and approves before code lands.
- Direct-to-`main` for solo iteration is fine. Use feature branches when a change feels risky or affects the data model.
- Update `PROJECT-STATUS.md` on every meaningful change: milestone progress, item resolved, new known issue, phase transition.

## Stack

Next.js 15 (App Router) on Vercel · Neon Postgres + Drizzle ORM · Tailwind v4 · @anthropic-ai/sdk · Resend (email) · custom session mgmt with `node:crypto` (Lucia v3 was sunset by maintainer; we rolled our own per their migration guidance — `src/auth/`).

Path alias: `@/*` → `src/*`.

## Conventions (apply everywhere)

- All user-content tables: `text` PK in form `<prefix>_<nanoid(16)>` via `src/lib/id.ts`. **Exception**: session row IDs are `sha256(token).hex()` for security (Lucia post-sunset pattern).
- All user-content tables: include `deleted_at timestamptz` from creation. All reads filter `WHERE deleted_at IS NULL`. Soft delete only.
- All markdown rendered through `react-markdown` + `rehype-sanitize`. Never `dangerouslySetInnerHTML`.
- All planning chatbot streaming uses `client.messages.stream(...)` then forward as SSE; tool_use intercepted server-side, executed in transaction, tool_result injected back.
- Master chat is the only AI flow that does **not** stream (needs full structured output for preview).
- Per-user Anthropic API key decrypted only at SDK construction; never logged.
- All timestamps stored as UTC (`timestamptz`); display formatted in `users.timezone` via `date-fns-tz`.
- The 8 verbatim LLM prompts in `priorities-tdd.md § Verbatim Prompts` MUST be used as written. Do not paraphrase.

## Migrations

Hand-written SQL files in `drizzle/migrations/` (numbered, immutable). Until automated migration runner lands, owner applies them manually via Neon's SQL editor. Track which have been applied in `PROJECT-STATUS.md § Recent Changes`.

Files written so far:
- `drizzle/migrations/0000_init_auth.sql` — M2 (users, sessions, magic_link_tokens)
- `drizzle/migrations/0001_user_settings.sql` — M3 (user_settings)
- `drizzle/migrations/0002_priorities.sql` — M4 (priorities)
- `drizzle/migrations/0003_priority_memory_and_files.sql` — M6 (priority_memory, priority_files)
- `drizzle/migrations/0004_quarters.sql` — M7 (quarters)
- `drizzle/migrations/0005_tasks_and_events.sql` — M8 (tasks, events)
- `drizzle/migrations/0006_calendar_feeds.sql` — M10 (calendar_feed_configs, calendar_feed_events)

## Build-order deviations from TDD

The TDD specifies a 20-milestone order; we're following it with two additive deviations (rationale in plan and PROJECT-STATUS):

1. **Cost circuit breaker pulled forward to M12** (TDD § Security requires cap check before every LLM call; first AI call is M12, not M19).
2. **Data export added to M19** (acceptance criterion #13 not slotted in TDD's milestone list).

## Don'ts

- Don't paraphrase the 8 verbatim prompts.
- Don't issue hard `DELETE` against user-content tables (soft-delete via `deleted_at`).
- Don't commit `.env.local` or `node_modules/` — both gitignored.
- Don't add features outside the current milestone unless the owner asks.
- Don't update git config (handled by owner). Don't `--force` push or skip hooks.
- Don't `dangerouslySetInnerHTML`.
