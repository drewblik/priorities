# Priorities → "Fit": Simplification Direction

> **Status:** Exploration / proposed pivot (2026-06-02). Not yet building. Captures the direction worked out with the owner so it doesn't evaporate. Supersedes nothing yet — `PROJECT-STATUS.md` and the TDD still describe the shipped v1. If this direction is adopted, those get reshaped around it.

## Why pivot

The shipped v1 is a planning operating system: a council of per-priority chatbots, three nested planning rituals (Quarter / Week / Day), a master-chat router, onboarding coach, re-planning modes, cost dashboards. It works — all 20 milestones verified — but it's **too Type A.** The owner reaches for a physical whiteboard instead.

**The real job, in the owner's words:** get personal priorities done around a *busy, constantly-changing consultant work calendar* — and feel the satisfaction of *crossing things off*.

The whiteboard isn't the problem. It's the spec.

## The product: a digitized whiteboard that schedules itself around work

The owner's actual whiteboard has three regions. The app is those three regions, kept independent:

1. **2026 Goals** — a short north-star list, written once, mostly static.
2. **Up next** — one rolling next-action per project. Cross it off → the app *suggests* the next step, owner confirms or edits. (Mirrors erasing "buy plane tickets" and writing "plan itinerary," but keeps the history instead of wiping it.)
3. **This week** — the only calendar-aware region.

The payoff that must survive everything: **crossing things off.**

## Core model decision: goals + maintenance replace "priorities"

- Every next-action and time-block **links to a Goal or to "Life maintenance."**
- This **collapses two layers into one** — there is no separate "priorities" list anymore. Goals (+ the maintenance bucket) are the only organizing layer.
- Enables an honest scoreboard: time/effort toward each goal vs. plain maintenance.
- Linking is lightweight (a tag/color on each item), never a rollup hierarchy to manage.

## How the calendar works

- **Read** the work calendar via the **Outlook .ics feed** (already built, read-only, just a URL — slips past corporate IT, which would block a two-way OAuth connection). These are the 🔒 fixed terrain.
- **Own** priority blocks *inside the app* (optionally mirror to a *personal* Google/Apple calendar the owner controls). The app **never writes to the work calendar.**
- **Suggest-and-approve:** the app proposes fits and re-fits; nothing moves until the owner taps accept.
- Priorities are expressed as a **mix**: some flexible ("deep work: 10 hrs, fit anywhere"), some windowed ("gym = mornings").
- **Everything gets a slot** — one-off next-actions included. This merges regions 2 and 3 functionally: crossing-off and scheduling become the same flow.
  - Caveat to design: tiny tasks ("call the surgeon," 10 min) should **batch into a short daily "knock-out" window** rather than each claiming a calendar block — otherwise the day fills with fifteen one-line slots.

## Locked decisions (from owner Q&A, 2026-06-02)

| Question | Decision |
|---|---|
| Re-fit behavior when work changes | **Suggest, owner approves** — nothing moves automatically |
| How a priority expresses its time need | **Mix** — flexible weekly targets + preferred windows |
| Work-calendar access | **Read-only .ics for work** (security); own blocks in-app / optional personal-calendar mirror |
| Rolling next-step authoring | **App suggests, owner confirms** (editable) |
| Goal ↔ action linking | **Linked** — every item ties to a Goal or "Life maintenance" |
| What gets scheduled | **Everything gets a slot** (one-offs batched into a knock-out window) |

## Open details (decide during build planning)

- Knock-out window mechanics + the small-task threshold (what counts as "tiny").
- How much is **AI** vs. plain heuristics: suggesting the next step and proposing fits could be a small LLM call, or rule-based. Lean heuristic first; add AI only where it clearly helps.
- Whether to ship the optional personal-calendar mirror in v1 or keep blocks app-only.
- Whether goals carry their own time targets, or only the recurring commitments under them do.

## Transition from the current build

Nothing here is built from scratch — the v1 has the right engine buried under the wrong UI.

**KEEP / REPURPOSE (the engine):**
- **Calendar feed ingestion** (`calendar-feeds.ts`, `calendar-sync.ts`, M10/M21) — read-only .ics, encrypted URL, sync, RSVP filter. This *is* the product now.
- **Tasks/events tables + recurrence engine** (`recurrence.ts`, M8) — become the scheduled blocks + recurring commitments.
- **Time-block overlap helper** (`time-block-overlap.ts`, M14) — the fit/conflict math.
- **Calendar conflict detection** (`calendar-conflicts.ts`, M20) — becomes the re-fit trigger.
- **Auth, settings, encryption** (M2/M3) — keep as-is.
- **`priorities` table → repurpose to `goals`** — drastically slimmed columns (name, color, order, optional weekly target). Add a "Life maintenance" pseudo-goal.

**RETIRE (the Type A layer):**
- Per-priority chatbots: Quarter (M12), Weekly (M13), Daily (M14) planning chat.
- The three planning rituals + `quarters` / `quarter_week_focus` tables (M7/M12).
- Master-chat router + confirm pipeline (M16/M17).
- Onboarding coach + council proposal (M18).
- Re-planning mode picker (M15).
- Per-priority memory + files + summarization (M6, M19) — the whiteboard doesn't need them.
- Cost dashboard (M19) → reduce to a single hard cap *if* any AI remains; remove if not.
- The "8 verbatim prompts" discipline — relax; far less prompt surface now.

**NET:** roughly half the milestones' worth of UI and prompt machinery comes out; the calendar/time-block/recurrence core stays and gets a much simpler face.
