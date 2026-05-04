# Priorities — Sub-App Extension Workflow

The practical guide for designing, building, and integrating each new sub-app extension to a Priority. This doc is the SPEC — sub-app implementation is **not in v1**. The first sub-app to actually get built post-v1 triggers implementation against this spec.

> Strategic context — why sub-apps are separate apps that extend a Priority, not embedded sections — lives in the Vision doc under "Sub-App Architecture." This doc is the *how*.

## V1 status

**Not implemented in v1.** v1 ships:
- Each Priority has nullable `sub_app_url` and `sub_app_auth_token` columns in the schema (designed but unused)
- Priority Detail UI does NOT have a "Connect sub-app" section in v1 — designed but not surfaced
- The contract endpoints (`/generate`, `/query`, `/push`, `/capabilities`) are spec'd here but no code implements them in either master or any sub-app

When the first sub-app gets built (any time post-v1), this doc serves as the spec. Implementation work then includes:
- Adding "Connect sub-app" section to Priority Detail
- Adding integration code in the master to call sub-app endpoints during planning and master chat
- Building the actual sub-app following the contract

## Repo and deployment shape

When the first sub-app is built:
- Sub-app gets **its own GitHub repo** (e.g., `priorities-piano-coach`, `priorities-meal-planner`)
- Sub-app gets **its own Vercel project** with its own preview URLs and production URL
- Sub-app gets **its own Neon database** (free tier per project; one Neon account hosts many projects)
- Sub-app gets **its own PWA manifest and home screen icon**. The user installs each sub-app as a separate app on their phone, just like any other home screen app. Master Priorities never embeds sub-app UI; each sub-app stays focused, fast, and independently navigable.
- Sub-app uses **the same Anthropic API key account** as the master — no separate billing
- The master Priorities platform calls each sub-app's HTTPS endpoints. The sub-app never touches the master's database directly.

### Why separate apps, not embedded sections

The Facebook problem — one app accreting feature after feature until it's slow and impossible to navigate — is exactly what we're avoiding. Master Priorities is the unified council + planning ritual + master chat. Each sub-app is a focused standalone tool with its own UI optimized for its domain (Piano Coach has a repertoire browser and practice log; Meal Planner has a recipe library and macro tracking; Medical Manager has a treatment timeline). The user opens master for "what's my day" and "talk to my council"; the user opens a sub-app for domain-specific deep work.

The bridge between them is the contract. Sub-apps push tasks/events to master via the contract; those items appear in master's daily view and can be checked off there. The user doesn't need to open Piano Coach to mark "practice arpeggios 15 min" complete — that task lives in master's daily view via the contract. They only open Piano Coach to browse repertoire, log a session, or see progress charts.

### Known v1 limitation: PWA cross-app navigation

PWAs installed from different origins behave more like separate browser tabs than separate native apps. When master Priorities opens a sub-app via `window.open(sub_app.base_url)`, the experience varies by platform:
- **Android**: usually routes to the installed PWA cleanly
- **iOS**: typically opens Safari first; user manually switches to the installed PWA

Acceptable. Resolves cleanly when the platform rebuilds as React Native (already on master's future roadmap).

## When to design a sub-app

After the master Priorities MVP is shipped (milestone 20 of master TDD) and you've used it personally for at least a quarter (yes — a full 13 weeks). The bar is high because:
- Most Priorities don't need a sub-app (just a chatbot persona + memory + planning strategies is enough)
- A sub-app makes sense ONLY when a Priority specifically needs serious computational depth (e.g., Piano Coach needs sheet music rendering and parsing; Meal Planner needs a real recipe database with macro lookup; Medical needs structured timeline + appointment scheduling)
- Building a sub-app is significant work — own repo, own deploy, own DB, own UI

If after a quarter of use a specific Priority is begging for capabilities that chat + free-form memory can't deliver, that's the signal. Build that one sub-app first.

## The 7-phase sub-app design and build sequence

### Phase 1: Conceive

Open a new conversation in the **Replit Idea Generation** project (this same project) and introduce the sub-app idea exactly as you would any new product:

> "I want to build a Piano Coach sub-app that extends my Piano Priority. It should track repertoire, suggest daily practice, and remember what I worked on."

The replit-app-design-process skill activates. Same canonical sequence runs again, scoped to the sub-app: Vision → Two-Way Refinement → FDD → TDD → Audit → Exec Summary → Handoff.

### Phase 2: Design (Vision + FDD + TDD + Project Status)

Four new docs (mirroring the master's pattern):

- `{sub-app-slug}-vision.md` — Why this sub-app exists, what's defensible about it, what its standalone value is even outside the parent Priority
- `{sub-app-slug}-fdd.md` — What the sub-app does for the user (its standalone UI, plus the contract surface to master Priorities)
- `{sub-app-slug}-tdd.md` — How the sub-app is built, with the four contract endpoints as first-class requirements
- `{sub-app-slug}-project-status.md` — Living tracker for the sub-app's build, copied from `priorities-project-status.md` template and adapted

The sub-app's TDD must include:
- All four contract endpoints with exact JSON shapes (see Contract section below)
- Bearer token auth for incoming requests (master → sub-app)
- Idempotency on the `/generate` endpoint
- Cost tracking per LLM call (the sub-app does its own LLM work, billed to the same Anthropic account)
- Standalone UI for direct user interaction (this is its own experience, not just an API)

### Phase 3: Set up the new repo

Mirror the master's setup pattern:
1. Create new GitHub repo: `priorities-{sub-app-slug}`
2. Create new Vercel project, connect to the GitHub repo
3. Create new Neon project, copy connection string
4. In Vercel, add env vars: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `AUTH_SECRET`, `MASTER_PRIORITIES_AUTH_TOKEN` (the token master will send when calling the sub-app)
5. Copy the contract types file from this doc (or the latest `priorities-sub-app-starter` template if you've built one)

### Phase 4: Build with Claude Code

Same pattern as master build:
1. Open `claude.ai/code`, start new session
2. Paste the sub-app's handoff prompt (from its TDD's Build Approach)
3. Attach `{sub-app-slug}-tdd.md`, `{sub-app-slug}-fdd.md`, `{sub-app-slug}-project-status.md`
4. Review Claude Code's plan, approve milestone 1
5. Iterate through milestones, testing on phone via Vercel preview URL

Sub-app builds are smaller in scope than the master — fewer milestones, fewer subsystems. Realistic timeline: a focused sub-app might be MVP-ready in 5-10 days of part-time iteration.

### Phase 5: Implement master-side sub-app integration (one-time work, only on first sub-app)

Before the sub-app can integrate with master Priorities, the master needs the sub-app integration code that v1 deferred. This is one-time work:

1. Add "Sub-app extension" section to Priority Detail UI (designed in master FDD Workflow 11)
2. Implement the 4-step "Connect sub-app" wizard (URL → token → capabilities check → confirm)
3. Implement `/api/agent-push` endpoint on master to receive items from sub-apps
4. Implement integration with planning chatbots: when a Priority has a connected sub-app, the planning chat can call sub-app's `/generate`
5. Implement integration with master chat: sub-app's `/query` tools register as available tools the master chat LLM can call
6. Test against a stub sub-app (50-line implementation of the contract returning hardcoded responses) before connecting the real sub-app

This implementation work is essentially TDD milestones 21-25 (5 new milestones added to master post-v1). Do it BEFORE shipping the actual sub-app so you can test against the stub first.

### Phase 6: Integrate the real sub-app

Once master has the integration code AND the sub-app has its contract endpoints live and validated:

1. Open Priorities master → Priority Detail (for the parent Priority) → "Sub-app extension" section
2. Tap "Connect a sub-app"
3. Enter:
   - **Base URL**: sub-app's production URL (e.g., `https://priorities-piano-coach.vercel.app`)
   - **Auth token**: the `MASTER_PRIORITIES_AUTH_TOKEN` you set in the sub-app's env vars
4. Master calls the sub-app's `/capabilities` endpoint to validate
5. If validation passes, sub-app appears in:
   - Priority Detail with "Connected to Piano Coach" badge + tools list
   - Planning chats for this Priority (sub-app's `/generate` is called as part of planning)
   - Master chat (sub-app's `/query` tools are registered as available)
6. If validation fails, error message tells you which endpoint is missing or malformed

After registration, the user installs the sub-app's PWA on their phone home screen separately (visiting the sub-app's URL and using the browser's "Add to Home Screen" prompt).

### Phase 7: Use it for a quarter, then iterate

Real usage will surface things the design didn't catch. Update the sub-app's `PROJECT-STATUS.md` as you iterate. Update the master's status doc when the sub-app integration is complete.

After your first sub-app is shipped, extract a `priorities-sub-app-starter` template repo:
- Pre-scaffolded Next.js project with the four contract endpoints stubbed
- Contract types file included
- Vercel config ready
- README explaining how to fill in sub-app-specific logic
- Reference implementation of one stub LLM call

For sub-app #2 onward, clone the starter and just fill in sub-app-specific logic. Could shave 10+ hours off each new sub-app build.

## The contract (full spec)

Every sub-app must implement all four endpoints. Auth via bearer token in `Authorization: Bearer <token>` header (token is the `MASTER_PRIORITIES_AUTH_TOKEN`).

### Endpoint 1: `GET /capabilities`

Master calls this on registration to validate the sub-app and discover its capabilities.

Request: no body
Response:
```json
{
  "name": "Piano Coach",
  "version": "1.0",
  "data_shapes": {
    "tasks": true,
    "events": true,
    "notes": false,
    "goals": false
  },
  "queries": [
    {
      "id": "list_repertoire",
      "description": "List the user's current piano repertoire",
      "input_schema": { "type": "object", "properties": {} }
    },
    {
      "id": "next_practice_suggestion",
      "description": "Suggest what to practice next based on history and weak spots",
      "input_schema": { "type": "object", "properties": {} }
    }
  ]
}
```

### Endpoint 2: `POST /generate`

Master calls this during a planning session for a Priority connected to this sub-app. The sub-app generates structured items to enrich the planning conversation.

Request:
```json
{
  "user_id": "<user_id from master>",
  "horizon": "quarter|weekly|daily",
  "horizon_context": {
    "quarter_label": "Q2 2026",
    "week_start_date": "2026-05-04",
    "day_date": "2026-05-04"
  },
  "user_timezone": "America/Los_Angeles",
  "minutes_budget": 180,
  "recent_priority_memory": [ /* last 10 entries from this Priority */ ],
  "recent_completions": [ /* last 7 days of completed tasks/events for this Priority */ ]
}
```

Response:
```json
{
  "tasks": [ /* proposed Task objects matching master's Task schema */ ],
  "events": [ /* proposed Event objects matching master's Event schema */ ],
  "notes": [ /* memory entries to add to this Priority */ ],
  "goals": [ /* SMART goal updates if relevant */ ],
  "summary": "Generated 3 practice tasks for this week focusing on left-hand technique",
  "cost_usd": 0.0234
}
```

### Endpoint 3: `POST /query`

Master calls this when the master chat needs to answer something using sub-app data.

Request:
```json
{
  "tool_name": "list_repertoire",
  "tool_input": { /* matches the input_schema from /capabilities */ },
  "user_id": "<user_id from master>"
}
```

Response:
```json
{
  "result": { /* free-form response from sub-app */ },
  "status": "ok|error",
  "message": "Optional human-readable message",
  "cost_usd": 0.0012
}
```

### Endpoint 4: `POST /push` (on master, called by sub-app)

This is the only endpoint where the sub-app calls master, not the other way around. Sub-apps push tasks/events to the user's master Priorities outside of planning sessions.

Master endpoint: `POST {master_base_url}/api/agent-push`
Auth: bearer token shared with the sub-app at registration time (separate from `MASTER_PRIORITIES_AUTH_TOKEN`)

Request:
```json
{
  "external_source": "piano-coach",
  "external_id": "<unique id within sub-app's namespace>",
  "owner_priority_id": "<priority_id from master>",
  "tasks": [ /* Task objects */ ],
  "events": [ /* Event objects */ ]
}
```

Idempotency: master uses `(external_source, external_id)` as a unique key per item. Re-pushing the same `external_id` updates the existing record rather than creating a duplicate.

## Cost considerations per sub-app

Each sub-app's LLM calls bill to the same Anthropic API account as master, so master's cost circuit breaker does not protect sub-app-internal calls. Each sub-app should implement its own per-user cost cap mirroring master's pattern (see master TDD "Cost circuit breaker"). Default caps are reasonable starting points; tune per sub-app based on actual usage.

When master calls a sub-app's `/generate` or `/query`, that call is logged in `chat_sessions` on master with the sub-app's reported `cost_usd`. The sub-app should return accurate cost in every response so master's cost surfacing reflects total spend across master + sub-apps.

## Failure modes

- **Sub-app unreachable**: master shows banner on Priority Detail; planning skips the sub-app for that session; user can continue planning without sub-app input
- **Sub-app contract validation fails on registration**: master refuses to register; error tells which endpoint failed
- **Sub-app returns malformed JSON**: master logs error, skips sub-app for that call, continues
- **Sub-app's own cost cap reached**: sub-app returns error in `/generate` response; master logs and shows banner

Master is designed to degrade gracefully when sub-apps misbehave. Sub-apps should likewise degrade gracefully when master is unreachable (cache locally, retry on next push opportunity).

## Future: real MCP wire format

Currently the contract is Priorities-custom. v2 candidate: adopt real MCP (Model Context Protocol) wire format so sub-apps become portable to other MCP hosts (Claude Desktop, etc.). Decision deferred until first 2-3 sub-apps are built — only worth the rewrite if portability matters by then.
