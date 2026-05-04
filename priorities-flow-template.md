# Priorities — Flow Whiteboarding Template & Checklist

A reference doc to keep handy while you whiteboard user flows for Priorities. Sketch on paper, iPad, or Excalidraw — then send the photos or text back to Claude using the templates here.

## Quick start

1. Pick a flow from the checklist below (start with Tier 1).
2. Sketch it on paper / iPad / Excalidraw — screen by screen, with arrows.
3. Note down decision points, edge cases, and new ideas as you sketch.
4. When done with a batch, photograph or export, send to Claude with brief notes.
5. Claude updates the FDD (and TDD if architectural) based on what you send.

## Whiteboarding medium

- **Pen and paper** — fastest. Photograph pages when done. Messy handwriting is fine.
- **iPad + Apple Pencil** in Apple Freeform or Notes — infinite canvas, easy to rearrange. Export as PDF/PNG.
- **Excalidraw** (excalidraw.com, free) — works on phone/iPad/desktop. Sketchy aesthetic. Best at a desk.

For Priorities, the flows that benefit most from whiteboarding involve the three planning sessions (queue + chat + calendar layout) and the master chat preview/confirm pattern — both are spatially complex.

## Flow checklist (priority order)

### Tier 1: Core daily loop (do these first — biggest doc impact)

- [ ] **1. First-time setup** — Sign up, Onboarding Coach welcome, Coach interview, Council Proposal Review, accept and land on Priorities List. What does the Coach interview transition between topics look like? What does an empty proposal cell look like vs filled? Skip path.
- [ ] **2. Manual Priority creation** — From Priorities List, create a new Priority via chatbot interview. What fields surface in what order? What does the in-progress draft look like as fields fill? Final review screen?
- [ ] **3. Quarter Plan session** — Layout of queue + chat + 13-week calendar. How does color-coding work as Priorities place focus on weeks? What does "Priority done, move to next" feel like? What does the calendar look like halfway through?
- [ ] **4. Weekly Plan session** — Same layout but week-scoped. How do tasks from quarter focus surface in weekly chat? How are they assigned to days visually?
- [ ] **5. Daily Plan session (3-step evening review)** — Progress check substep, capture substep, plan-tomorrow substep. What's the transition between substeps? Can substeps be skipped? What does the day timeline look like as time blocks fill?
- [ ] **6. Daily check-in / Daily View** — Morning open. What's at top, middle, bottom? Where's the master chat trigger? How do you check off tasks vs events vs time-blocked items?

### Tier 2: Master chat interactions (next biggest impact)

- [ ] **7. Master chat — simple capture** — "Skipping gym tomorrow." Preview surfaces with affected Priority(ies). Confirm flow.
- [ ] **8. Master chat — destructive action** — "Delete the Tuesday cardio block." Preview shows what will be deleted. Confirmation modal pattern.
- [ ] **9. Master chat — multi-priority update** — "I'm sick today." Affects Gym (skip), Work (work from bed), Wellbeing (rest, hydrate). Preview shows multiple Priorities affected.
- [ ] **10. Master chat — screen context disambiguation** — User is in Weekly Plan with Gym selected. Says "delete this." Master chat resolves "this" using screen context. What does the resolution look like in the preview?
- [ ] **11. Master chat — needs clarification** — User says something ambiguous. Master chat asks question instead of proposing. What does that turn look like?

### Tier 3: Council management

- [ ] **12. Drag-to-reorder council** — How does drag feedback look on mobile? Optimistic UI vs server-confirmed feedback.
- [ ] **13. Pause / archive a Priority** — UI affordances. Where do paused/archived Priorities go visually?
- [ ] **14. Edit Priority Detail — knowledge base section** — Adding a memory entry, editing pinned summary, uploading a file. What does the memory list look like with 50+ entries (before summarization triggers)?
- [ ] **15. Mid-cycle Priority addition** — Create a new Priority mid-quarter. The three opt-in banners (quarter / week / day). Scoped planning UI for just the new Priority.

### Tier 4: Failure / edge cases

- [ ] **16. Cost cap reached mid-session** — Banner appears, AI features pause. What does the planning session look like in the paused state? Path to raise cap or wait.
- [ ] **17. Calendar feed broken** — Banner in Settings. Daily View shows last cached events with stale indicator.
- [ ] **18. Empty Council** — User skipped onboarding. Empty Priorities List. CTA to create first Priority. What's the first-time-empty experience like?
- [ ] **19. Conflict during planning** — Priority B tries to claim a time slot Priority A already has. Conflict feedback as system message in chat.
- [ ] **20. Re-planning a partly-planned horizon** — Mode picker (Replan all / Adjust). Adjust mode: tap a specific week/day/Priority to redo just that.
- [ ] **21. Quarter auto-transition** — User opens app on April 1 (Q2 starts). Q1 closes, Q2 created empty, "Plan your new quarter" banner appears. What does that landing experience feel like?

### Tier 5: Higher-level journeys

- [ ] **22. Day in the life** — Where Priorities appears throughout the day. Morning open → mid-day captures → evening review.
- [ ] **23. Full quarter cycle** — From quarter planning at start to evening review at end of quarter. The arc.
- [ ] **24. Month one as a new user** — From Onboarding Coach to "Priorities is part of my life." When does it click?

## Template for each flow (copy into chat with each batch)

```
FLOW: [name from checklist]
TRIGGER: [what starts this flow]
GOAL: [what the user is trying to do]

STEPS (screen by screen):
1. [User sees X] → [User does Y] → [System does Z]
2. ...
3. ...

DECISION POINTS / BRANCHES:
- If [condition], then [path A]
- If [condition], then [path B]

EDGE CASES YOU NOTICED:
- What if [something fails]?
- What about [unexpected user behavior]?

NEW IDEAS THAT CAME UP:
- [feature, polish, behavior, new screen]

QUESTIONS FOR CLAUDE:
- [things you're unsure about]
```

## Template for journeys (higher-level)

```
JOURNEY: [name from checklist]
STARTING STATE: [where the user begins — emotionally, contextually]
KEY MOMENTS: [what they encounter, feel, do over time]
FRICTIONS: [where it might break, feel wrong, lose momentum]
SUCCESS STATE: [what "got it" looks like — and what it feels like]
```

## What you send back

A single chat message per batch with:
1. **Photos or exports of the sketches** (drag in or upload from your phone)
2. **Brief notes using the template above** for each flow — even just a few bullets is fine
3. **Anything else you noticed** that doesn't fit the template

You don't need to send all 24 at once. Tier 1 alone (6 flows) will substantially improve the docs. Send what you have when you have it.

## What Claude does with it

- Updates FDD's **Workflow descriptions** with the concrete sketch-derived flows
- Adds detailed flows as a new **"Detailed User Flows"** appendix to the FDD or a separate `priorities-user-flows.md` doc
- Surfaces new functional requirements that came up — may need to land in TDD too (new screen, new field, new confirmation pattern)
- Captures new ideas as Phase 2 backlog items in the project status doc
- Captures unresolved questions in a **"design open items"** section

If a sketch surfaces something architectural ("the chat actually needs to know what's selected"), Claude flags it as a TDD-level change rather than just an FDD update.

## Tips while sketching

- **Don't aim for polish.** Stick figures and box-and-arrow are perfect.
- **Talk through the flow out loud as you sketch.** You'll surface friction faster.
- **Use a different color for "what if this fails?"** — keeps edge cases visible without cluttering the happy path.
- **Annotate moments where you think "this would feel slow"** or "this would feel surprising" — those are gold for the FDD.
- **Don't try to design pixel-perfect screens.** Boxes labeled "task list" or "chat input" are enough.
- **If you get stuck, walk away for 10 minutes.** Coming back fresh almost always surfaces what was missing.

## When you're done with a batch

Just paste this into a new chat in the project:

> I whiteboarded [flows X, Y, Z]. Here are the photos/notes. Update the docs.

Claude takes it from there.
