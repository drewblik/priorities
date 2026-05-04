# Priorities — Vision

> Your priorities, planned by their advocates.

## Backstory & Philosophy

Life management apps fall into two camps. Flat task managers like Things, Todoist, and Notion give you infinite lists with no opinion about what matters. Smart silos like MyFitnessPal, Strava, and Headspace go deep on one domain but live in isolation from each other and from the rest of your life. Neither captures how people actually plan — by sitting with each area of life one at a time, thinking about what it needs, then fitting it all into a finite week.

The original concept (then called Tend) tried to bridge this with a Wheel-of-Life-inspired domain structure, an AI daily planner, and an extensible agent contract. Whiteboarding revealed something simpler and more powerful underneath: the structure people actually want isn't domains; it's **a council of advocates**, one for each priority that matters to them, each with its own knowledge, its own goals, and its own way of planning.

You don't think in eight abstract life domains. You think "I need to handle gym, work, dating, piano, and getting my car serviced." Each of those is a real thing in your life with real planning needs. **Priorities** is built around that reality: you create a priority for each thing that matters, you talk to each one in turn when you're planning, and the order you talk to them is the order they get to claim time on your calendar.

## The Idea

Priorities is a mobile-first app for planning life by sequentially conversing with a council of priority chatbots across three nested horizons: quarterly (10 weeks), weekly, and daily.

You build the council by creating one Priority per area of your life that matters — Gym, Nutrition, Piano, Work, Dating, Car Maintenance, Wellbeing, Vacations, whatever shape your life has. Each Priority is its own chatbot persona with its own customizable letter-P icon, its own SMART goal, its own knowledge base built up through a creation-time interview, its own memory files (lesson plans, recipes, training programs, repair logs), and its own check-in cadence.

When it's time to plan, you go through your council in order. Quarter planning happens at the start of every 10-week block: you sit with each Priority in turn and they help you define the arc of the quarter, labeling each week with what that Priority needs from it. Weekly planning happens once a week (typically Saturday morning or Sunday night): you sit with each Priority in turn and they help you assign tasks to days. Daily planning happens each evening: you sit with each Priority in turn and they help you time-block tomorrow.

Throughout the day, when you don't want to convene the whole council, you talk to a master chat. The master chat is a router — when you say "I'm skipping gym tomorrow" or "I added a new song to my piano repertoire" or "I want to add a stretch session this week," the master chat figures out which Priority needs to know, updates that Priority's state, and the daily/weekly plan adjusts accordingly. The council is always there; the master chat is the everyday entry point.

The order of your council is the order of conflict resolution. Drag Work to the top and Work fills your calendar first. Gym further down can't overwrite Work's blocks. The drag-to-prioritize gesture isn't a list-sorting affordance — it's the actual mechanism by which you tell your life what wins when things compete.

## Why This Matters

People don't fail at planning because they don't have apps. They fail because they plan their life as one giant undifferentiated to-do list, then try to mediate competing priorities in their head in real time. Priorities externalizes that mediation. Each Priority gets its turn to plan; the order is explicit and editable; the calendar shows exactly who got what time and why.

The council pattern also solves the "smart silo" problem. You don't have to choose between MyFitnessPal's depth on nutrition and Strava's depth on running and your therapist's depth on relationships. The Nutrition priority can get as deep as it needs (and can extend to a connected sub-app for serious meal planning). The same is true for every other area. But all of them sit in the same council and plan into the same week, so nothing gets lost in a silo.

## Prior Art & Competitive Landscape

- **Flat task managers** (Things, Todoist, Notion, TickTick): infinite lists, zero opinion about what matters or how to balance areas of life. No conflict resolution. No structured planning ritual.
- **Smart silos** (MyFitnessPal, Strava, Headspace, Calm, Noom): deep on one domain, completely disconnected from each other and from your overall calendar.
- **Coaching apps** (BetterUp, Coach.me, Fabulous): single voice, single perspective, no concept of competing priorities.
- **General AI assistants** (ChatGPT custom GPTs, Claude Projects): you can roll your own per-domain personas, but there's no planning ritual, no calendar, no conflict resolution.
- **Productivity frameworks** (GTD, Eisenhower Matrix, Wheel of Life, OKRs): conceptual frameworks; require manual implementation; not interactive.
- **Council-of-advisors literature** (Napoleon Hill's "Master Mind," modern executive coaching): the idea that decisions get sharper when you imagine asking a panel of advisors. Priorities operationalizes this into a daily ritual.

The closest cousin in spirit is something like a quarterly business review, scaled down to one person and made conversational. Nothing in the consumer app market does this.

## The Three Real Differentiators

1. **The council pattern itself.** Each Priority is a chatbot with a personality, knowledge, and an opinion. You don't fight a flat list; you have a conversation with the part of your life that cares about the thing being planned. This is fundamentally different from how every other planning app works.
2. **Sequential planning with order-as-conflict-resolution.** The drag-to-prioritize gesture is the mechanism by which you decide what wins. Earlier-in-queue claims calendar time first; later-in-queue cannot overwrite. This makes priority tradeoffs explicit and editable rather than implicit and contested.
3. **Three nested horizons with the same ritual at each level.** Quarter, week, day — same flow (queue at top, chat in middle, calendar at bottom), same council, same Priority order. Each Priority knows how to plan for each horizon. The pattern compounds: a well-planned quarter makes weekly planning faster; a well-planned week makes daily planning trivial.

## Strategic Moat

The moat is twofold. First, the **planning ritual itself** — the specific flow of council-by-priority-by-horizon — is the kind of thing that's easy to describe and hard to replicate well. The mechanics need to be tight: how questions are asked during quarter planning vs. weekly vs. daily, how a Priority's knowledge base evolves through use, how the master chat routes ad-hoc capture, how conflict resolution actually feels when Work and Gym compete for an evening. Getting these right takes iteration and conviction.

Second, the **per-user knowledge bases** that grow inside each Priority over time. The Piano priority that knows your repertoire, your weak spots, your preferred practice schedule, and your teacher's last three pieces of feedback is not portable. The Nutrition priority that knows the meals you actually like, what's in your pantry, your macro targets, and which week you tend to fall off plan is not portable. As you use Priorities, your council becomes more valuable to you specifically — and harder to abandon.

These are real moats but they're also slow to materialize. V1 ships the platform; the moat compounds as the council grows.

## Long-Term Vision

A council of priority advocates that knows you well enough to plan your life faster than you could alone. Each Priority a deep, opinionated, evolving collaborator. The whole council coordinated and ordered to your real preferences. Optionally extended by sub-apps when a Priority's domain needs serious computational depth (a Piano sub-app with sheet music analysis; a Meal Planner sub-app with store-aware grocery lists; a Medical sub-app with treatment timelines). Optionally portable to other AI hosts via published agent contracts when standards mature.

The end state is that planning your week takes 20 minutes once a week instead of being scattered cognitive overhead across every day, and the result is a calendar that actually reflects your priorities in their actual order.

## Future Roadmap

**v1 (this build).** The platform itself: priority creation, three planning horizons (quarterly, weekly, daily), the master chat router, calendar feed integration (Outlook + Google), basic knowledge base per Priority, sub-app extensibility via the agent contract for Priorities that want to extend.

**v1.1.** Trash recovery UI. Search across the council. Smart suggestions for new priorities based on conversation patterns. Better visualization of yearly arcs (since yearly notes are captured but lightly surfaced in v1).

**v2.** Native iOS/Android via React Native (much smoother cross-app navigation when sub-apps proliferate). Push notifications. Real MCP wire format adoption so Priorities and sub-apps become portable to Claude Desktop and other MCP hosts. Multi-user / shared priorities (e.g., partners co-planning a Travel priority).

**v3+.** Council templates ("I'm a new parent," "I'm building a startup," "I'm training for a marathon") — pre-built priority sets with starter knowledge bases that users adapt. Agent marketplace if the contract is published as a standard. Voice input. Advanced analytics across the council ("you've under-allocated to Wellbeing for three weeks").

## Strategic Decisions

- **Personal-but-shareable, public-quality.** V1 stays a personal project but is built with the intent that it could become a real product. The contract design, the data model, and the UX assume real users.
- **Monetization deferred.** Build the thing first; figure out pricing later. Probable model is freemium (limited council size free, unlimited council + sub-app extensions paid) or per-Priority pricing.
- **Mobile-first PWA for v1, React Native for v2.** Same architecture decision as before; phone-friendly iteration loop with Claude Code stays the build approach.
- **Sub-apps are optional extensions, not the architectural backbone.** A Priority is fully functional with just its knowledge base and chatbot. Sub-apps exist for Priorities that want depth (heavy compute, custom UIs, large data sets) but most Priorities won't need one.
- **Master chat as router, not as separate assistant.** The master chat doesn't have its own knowledge — it routes to the right Priority and lets that Priority handle the actual update. This keeps the council pure and prevents drift.

## Architectural Decisions

- **Each Priority is a chatbot with a hybrid knowledge base.** Required structured core: name, custom P icon, SMART goal, minutes-per-week target, check-in cadence, planning strategies (one each for Q/W/D — short prompts that tell the Priority how to plan for each horizon). Plus free-form memory the chatbot reads from and updates over time: markdown notes, distilled context from past conversations, attached files (lesson plans, recipes, training programs, repair logs). The structured core is the contract; the memory is the lived knowledge.
- **Three planning sessions, same shape.** Quarter, weekly, daily planning all use the same UI: priority queue at top, chat with current priority in middle, time-horizon calendar at bottom. The Priority's behavior differs by horizon (Quarter session asks about week-by-week focus; weekly session assigns to days; daily session time-blocks).
- **Order = conflict resolution.** Calendar fill happens in council order. Each Priority's planner can only place items in time blocks not yet claimed by a higher-priority Priority. Calendar feed events (Outlook/Google) are immovable and treated as above the council.
- **Master chat: auto-detect, then confirm.** When you message the master chat, an LLM classifier examines your message against the council and identifies which Priority(ies) are affected. Before applying any update, the master chat surfaces a clear preview of what it intends to do ("This will update Gym: skip tomorrow's session, reschedule to Friday — confirm?"). Only on user confirmation does the update propagate to the affected Priority's memory and the daily plan. This protects against silent misrouting (the wrong Priority getting an update) without making the flow feel transactional.
- **Master chat receives full screen context.** Every screen that opens master chat passes a context envelope describing what the user is currently seeing: page (priorities list, planning session, daily view), horizon being planned (Q/W/D), currently focused Priority if any, items currently visible in the calendar/queue, items currently selected. This means commands like "delete the Tuesday cardio block" or "move that to Friday" or "reschedule this whole week" resolve correctly without the user having to spell out unique IDs. The context envelope is rebuilt on each master chat invocation; nothing persists between sessions. This is one of those decisions that's hard to retrofit because every screen needs to know to pass context, so it's baked into v1 from the start.
- **Calendar feeds remain in v1.** Outlook and Google Calendar import via .ics. External events take precedence over all priorities (work meetings can't be overwritten). They show up on the daily plan automatically.
- **Onboarding via an Onboarding Coach chatbot.** First-run experience is not a blank list. A dedicated Onboarding Coach chatbot interviews the user about their life across multiple dimensions (work, health, relationships, hobbies, finances, current ambitions, recent big life events) and proposes a starter council based on what they say — typically 5-10 Priorities with names, suggested icons, and pre-populated knowledge bases that capture what the user mentioned in the interview. The user then reviews the proposal: keep, edit, remove, or add Priorities. Each accepted Priority becomes a real Priority on day 1, already partially populated with relevant context — meaning the user doesn't have to go through the standard per-Priority creation interview from scratch for each one. A "skip and build blank" escape hatch is always available for users who'd rather start empty. This is the magical first-run moment that turns "what even are my priorities?" into a concrete starting council in 10-15 minutes.
- **Sub-app contract documented but not implemented in v1.** The original sub-app contract (separate repo per sub-app, contract endpoints for `/generate`, `/query`, `/push`, `/capabilities`) is preserved as a documented specification. v1 does not implement the registration/integration code. The first sub-app built after v1 ships (if any) is what triggers actual implementation. This avoids speculative architecture while keeping the door open — the contract spec lives alongside the docs so the integration shape is known when needed.
- **Cost routing.** Sonnet for the planning conversations and master chat (these are the quality moments). Haiku for routing classification and lightweight ops. Estimated cost ~$15-20/month active personal use.
- **Routines fold into a Priority, not a separate concept.** Morning and night routines aren't a first-class platform feature. The user creates a Wellbeing or Daily Routine Priority (or both) and that Priority owns its routine items and adds them to the daily plan. This keeps the platform lean — there's one mechanism (the council) and routines are just one of many Priorities you might create. If routine items need special UX support in the daily plan view (a dedicated "morning" / "evening" section, e.g.), that's an FDD-level decision.
- **Yearly horizon stays as light notes only.** No yearly planning session, no yearly council ritual. Each Priority can store light yearly context as part of its free-form memory ("this year I want to take a big trip in Q3," "this year I want to add 30 lbs to my deadlift"). Three planning horizons (Quarter, Week, Day) is the product. Yearly is captured ambiently and surfaces in quarter planning as context, not as its own session.

## Still Open

The four Vision-level open questions from initial draft are all now resolved (see Architectural Decisions for: hybrid knowledge base structure, master chat auto-detect-and-confirm, master chat full screen awareness, routines folding into a Priority, yearly horizon as light notes only, sub-app contract documented but not implemented in v1, Onboarding Coach for first-run).

What remains genuinely open:

- **Real MCP wire format adoption when sub-apps actually get built.** When the first sub-app gets built (post-v1), the question becomes: implement against the documented Priorities-custom contract, or rewrite to real MCP wire format for portability to other MCP hosts? Decision deferred to that point — likely Priorities-custom for the first sub-app (validate the pattern), MCP from sub-app #2 onward if portability matters by then.
