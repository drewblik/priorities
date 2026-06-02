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

- **Goals + a "Life maintenance" bucket are the only organizing layer.** No separate "priorities" list. Every captured item links to a goal or to maintenance. This is what powers the scoreboard.
- **Capture → inbox → file.** Items arrive via text/voice/quick-add, land in one inbox, get tied to a goal (app suggests, owner tweaks).
- **Rolling next-actions.** One live next-step per project; cross it off → app suggests the next step, owner confirms/edits.
- **The scoreboard** is the home screen and the soul: per-goal pace/status (Rocket-Money-style bars), plus maintenance.
- **Nudges** push when triggers fire; each nudge offers snooze / plan / dismiss.

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
- **Frictionless multi-channel capture** + an inbox/triage.
- **The goal scoreboard** + pace/staleness/cold-goal detection (the watchdog logic).
- **The periodic check-in heartbeat.**

**RETIRE:**
- All per-priority chatbots + the Quarter/Week/Day rituals + `quarters` tables.
- Master-chat router, onboarding coach, re-planning picker.
- Per-priority memory/files/summarization, cost dashboard.
- The auto-scheduler / "fit everything into the gaps" ambition (owner drifts on blocks; only committed blocks are scheduled).
- The "8 verbatim prompts" discipline.

**NET:** most of the v1's UI and prompt machinery comes out; a slice of the calendar engine stays; and the real work shifts to three *new* pillars — capture, the honest scoreboard, and push nudges.
