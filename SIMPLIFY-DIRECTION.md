# Priorities → "Rocket Money for your goals": Simplification Direction

> **Status:** Exploration / proposed pivot (2026-06-02). Not yet building. Captures the direction worked out with the owner through structured Q&A so it doesn't evaporate. Supersedes nothing yet — `PROJECT-STATUS.md` and the TDD still describe the shipped v1. If adopted, those get reshaped around this.

## Why pivot

The shipped v1 is a planning operating system (council of per-priority chatbots, three nested planning rituals, master-chat router, onboarding coach, cost dashboards). All 20 milestones verified — but it's **too Type A.** The owner reaches for a physical whiteboard instead.

We then pressure-tested the idea hard (3 rounds of multiple-choice interrogation, including "why isn't this just Apple Reminders?"). The answers moved the concept decisively **away from an auto-scheduler** and toward a **watchdog**.

## What it actually is: a watchdog for your goals

Like **Rocket Money** — which doesn't ask you to operate a budget, it passively watches and pings you ("you're over budget," "this bill went up") — this app **watches your goals and to-dos and tells you when you're slipping.** You don't live in it; it comes to you.

**Three jobs, in priority order:**
1. **Never forget** (the #1 pain) — frictionless capture of anything, from anywhere.
2. **Show the truth about your goals** (the core differentiator) — the honest scoreboard Reminders can't show: are you actually moving each 2026 goal, or just doing maintenance?
3. **Proactively flag slipping** — push you when a goal is going cold, a task is stale, or you're behind pace.

The calendar is a **thin supporting actor**, not the engine.

## The model

- **Areas are the organizing layer.** A short list of areas, of three kinds: **Goals** (2026 goals, pace-tracked), **Work-clients** (each a deep task tree), and **Life maintenance** (one bucket). No separate "priorities" list. Every item belongs to an area. This powers the scoreboard.
- **Capture deep, surface shallow.** Items can nest arbitrarily (Client → project → task → subtask), faithful to how consulting work decomposes — but the app only ever *shows* the next action per branch + the rollup. The tree exists; the owner never manages it.
- **Rolling next-actions.** One live next-step per branch; cross it off → app suggests the next step, owner confirms/edits.
- **The scoreboard** is the soul: per-area truth (Goals show pace bars; Work shows open/overdue + recent activity; Maintenance shows done count). It shows its own **freshness/confidence** and stays quiet when unsure.
- **Nudges** push when triggers fire; each offers snooze / plan / dismiss.

## The core daily loop (the product in one motion)

1. Owner keeps their **existing desktop sticky-note log** all day (fast, local, full work detail).
2. When convenient, **paste the dump into the app** (coexist + paste — the sticky note stays the speed-of-thought scratchpad).
3. App **parses it**: what was *done* → updates scoreboard + marks committed blocks done; what's *left* → files into the deep tree under the right area, links to a goal where relevant.
4. App **returns the "prettier sticky note" + day-management coaching** (overloaded afternoon, neglected client, what to point at next). **This paste→organize→coach moment is where the AI is concentrated** — not scattered across many chatbots.
5. **Watchdog** runs in the background across all areas; **pushes** only when something genuinely slips, and only when its data is fresh enough to be sure.
6. **Calendar stays thin:** reads work meetings (free automatic "done" data + free-time awareness), holds only committed blocks (gym).

### Stale-data toolkit (simplest contact first)
The daily paste is the heartbeat. Layered with: calendar meetings auto-counting as done (semi-automatic work data, like a bank feed); committed blocks assumed done unless skipped; one-tap reply to a push ("worked out ✅"); a weekly check-in for anything uncertain; and the **anti-lying safeguard** — surface freshness ("updated 2 days ago") and stay silent rather than fire a false "behind!" alarm.

## ⚠️ The make-or-break risk (design around THIS)

Rocket Money's data is automatic. **This app's data is not** — it depends on the owner checking things off and answering check-ins. **A scoreboard fed by stale data lies**, and a scoreboard that cries "behind!" when you're not is *worse than nothing* — it kills trust, then gets muted, then abandoned. (This is how every tracker dies.)

**Therefore the single most important feature is the low-friction activity heartbeat:** a quick periodic **"did you get to X? (yes / a bit / no)"** check-in, plus assuming committed blocks happened unless told otherwise, plus easy crossing-off. If this loop is frictionless and the scoreboard stays honest, the app is great. If not, it's a dead tracker. **Everything else is secondary to keeping the scoreboard true.**

## Locked decisions (owner Q&A, 2026-06-02)

| Question | Decision |
|---|---|
| #1 pain | **Forgetting / losing track** |
| How often work disrupts the plan | A few times a week (not hourly → no real-time auto-refit needed) |
| Does owner follow time-blocks? | **Drifts** → blocks must be gentle, never a contract |
| The one job | **Goal progress — "Rocket Money for my goals"** |
| How nudges reach owner | **Push notifications** |
| Which slip-ups to flag | Task sitting too long · behind pace on a goal · goal gone cold (**not** "fill free time") |
| Calendar role | **Only block what I commit to** (e.g. gym); nudge everything else as a list |
| Capture method | **All of: text-it-like-a-person, quick-add, voice** → one inbox |
| How it knows you did something | **Combination**: check off + assume committed blocks + ask via check-in |
| Per-goal setup effort | **App suggests target/cadence, owner tweaks** |
| Nudge action | **Snooze / plan / dismiss** all offered |
| Why not Apple Reminders | **Goal-truth scoreboard Reminders can't show** |
| Primary daytime input | **Coexist + paste** — keep the desktop sticky note, paste the dump into the app periodically |
| Nesting depth | **Capture deep, surface shallow** — store the tree, show only next-action + rollup |
| What the paste returns | **Cleaned-up note + day-management coaching** (the concentrated AI moment) |
| Work-data handling | **Full detail, owner-accepted risk** — design still encrypts at rest + keeps a cheap code-name escape hatch |

## Open details (decide during build planning)

- Scoreboard form: time-based (hrs toward goal) vs task-based vs check-in-based — likely a blend.
- Check-in cadence + how it picks what to ask about.
- Push-notification infra (the current v1 has NONE — this is new).
- "Text it like a person" channel: SMS (Twilio) vs a chat thread in-app vs email-in.
- Nudge volume ceiling to prevent fatigue (the second-biggest churn risk after stale data).
- How much is AI (parsing captures, suggesting goal links/next-steps) vs heuristic.

## Transition from the current build

The v1 has a useful engine buried under the wrong UI — but this pivot also needs **new pillars the v1 never had.**

**KEEP / REPURPOSE:**
- Calendar feed ingestion (`calendar-feeds.ts`, `calendar-sync.ts`) — read-only .ics work feed, now thin (just for committed-block conflict-dodging + knowing free time).
- Tasks/recurrence engine (`recurrence.ts`) — committed recurring blocks.
- Time-block overlap (`time-block-overlap.ts`) — keep committed blocks off work meetings.
- Auth, settings, encryption (M2/M3) — as-is.
- `priorities` table → slim into `goals` (+ a maintenance pseudo-goal).

**BUILD NEW (didn't exist in v1):**
- **Push notifications** (v1 explicitly had none) — the nudge delivery channel.
- **The paste-parse engine** — ingest a messy sticky-note dump, split done-vs-todo, file into the area tree, link to goals, and return a cleaned note + day-management coaching. **This is the central new AI feature** (and where the AI is now concentrated).
- **Frictionless multi-channel capture** (text / voice / quick-add) + an inbox/triage, as the secondary always-on input.
- **The goal scoreboard** + pace/staleness/cold-goal detection (the watchdog logic).
- **The periodic check-in heartbeat.**

**RETIRE:**
- All per-priority chatbots + the Quarter/Week/Day rituals + `quarters` tables.
- Master-chat router, onboarding coach, re-planning picker.
- Per-priority memory/files/summarization, cost dashboard.
- The auto-scheduler / "fit everything into the gaps" ambition (owner drifts on blocks; only committed blocks are scheduled).
- The "8 verbatim prompts" discipline.

**NET:** most of the v1's UI and prompt machinery comes out; a slice of the calendar engine stays; and the real work shifts to three *new* pillars — capture, the honest scoreboard, and push nudges.
