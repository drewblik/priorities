# Priorities — Setup Walkthrough

The practical "what you do next" sequence to get Priorities built.

**Workflow at a glance:**
- **Phases 1-4 (initial setup): do these on desktop.** Account creation, first handoff to Claude Code, plan review, infrastructure wiring. Easier and faster on a real keyboard with multiple tabs.
- **Phase 5 onward (iteration loop): pure phone.** Once infrastructure is wired and the preview URL is live, the build-test-iterate loop happens entirely from your phone (Claude Code in browser/app + Vercel preview URL).

## Where you are right now

You have these design docs ready (in `/mnt/user-data/outputs/`):
- `priorities-vision.md` — strategic context (your reference)
- `priorities-fdd.md` — what Priorities does for the user (Claude Code reads this)
- `priorities-tdd.md` — how Priorities is built (Claude Code reads this)
- `priorities-project-status.md` — living tracker (Claude Code copies this into the repo)
- `priorities-exec-summary.md` — navigation hub (your reference)
- `priorities-setup-walkthrough.md` — this doc (your reference)
- `priorities-flow-template.md` — whiteboarding tool (your reference)
- `priorities-sub-app-workflow.md` — for post-v1 sub-apps (your reference)

## Phase 1: Create accounts (~30 min on desktop, $20 in Anthropic credits)

Open each account in browser tabs.

1. **Anthropic API account** — `console.anthropic.com`. Sign in with the same email as your Claude Max account if convenient. Go to **Settings → Billing** and add $20 in credits to start. Then go to **API Keys → Create Key** and copy the key (starts with `sk-ant-`). Save it somewhere safe — you'll need it twice (for Vercel env var and inside Priorities itself).
2. **GitHub** — `github.com/signup`. Free. Skip if you have one.
3. **Vercel** — `vercel.com/signup`. Choose "Continue with GitHub." Free Hobby tier.
4. **Neon** — `neon.tech`. Sign up with GitHub. Free tier. Once in, **create a new project** named "priorities" — this gives you a Postgres connection string. Save it (starts with `postgresql://`).
5. **Resend** — `resend.com/signup`. Free tier (3,000 emails/month, 100/day). Used for sending magic-link login emails. After sign-in, go to **API Keys** and create a key. Save it. You'll also need to verify a sending domain later, but for testing you can use Resend's onboarding domain.

You now have everything you need to build. Total cost: $20 in Anthropic credits, that's it.

## Phase 2: First handoff to Claude Code (desktop)

Open `claude.ai/code` in a browser tab. Start a new session.

**Paste this exact prompt** (it's the handoff prompt from the TDD):

> I'm handing off the Technical Design Document for a personal life-management platform called Priorities. Read it end-to-end, then enter plan mode and propose the build order. The TDD already specifies a recommended build order — verify yours matches it or explain any deviation. Do not write any code until I approve the plan. The FDD is supporting context for product/UX decisions when the TDD doesn't specify literally; only refer to the FDD if the TDD is ambiguous. As part of the build, copy `priorities-project-status.md` into the repo root as `PROJECT-STATUS.md` and update it after every meaningful change going forward — milestone progress, items resolved, new known issues, phase transitions.

Then upload **`priorities-tdd.md`**, **`priorities-fdd.md`**, and **`priorities-project-status.md`**. The other docs are for your reference — Claude Code doesn't need them.

## Phase 3: Review Claude Code's plan (desktop)

Claude Code will respond with a build plan. **Do not approve it blindly.** Check that it:

- Matches the TDD's 20-milestone build order (or explains any deviation)
- Plans to use the verbatim prompts (not paraphrase them) for Onboarding Coach, Council Proposal, Priority Creation, Quarter/Weekly/Daily Planning, Master Chat Router, and Memory Summarization
- Plans to create all the SQL tables with the indexes specified in the TDD (including the new ones: `magic_link_tokens`, `generation_locks`, `instance_of_*_id` fields, `removed_from_source_at`)
- Plans to use Next.js 15 + Drizzle + Lucia + Neon + Resend — not substitutes
- Plans to set up Vercel deployment early (milestone 1) so you can verify on phone
- Plans to copy `priorities-project-status.md` into the repo as `PROJECT-STATUS.md` during milestone 1

If anything looks off, tell Claude Code what you want changed. When the plan looks right, tell it to proceed with milestone 1 only.

## Phase 4: Wire infrastructure (desktop, between milestones 1 and 2)

After milestone 1 (project scaffolded, pushed to GitHub):

1. **Connect GitHub repo to Vercel.** In Vercel: Add New Project → Import from GitHub → select the `priorities` repo → click Deploy. First deploy will be the empty scaffolded app. Get the preview URL.
2. **Connect Neon to Vercel.** In Vercel project: Storage → Add Database → Connect Existing Database → paste your Neon connection string. Vercel will set `DATABASE_URL` as an env var automatically.
3. **Add env vars in Vercel** (Project Settings → Environment Variables → Add):
   - `ANTHROPIC_API_KEY` = your sk-ant-... key (this is a fallback; users also enter it inside Priorities per-user)
   - `RESEND_API_KEY` = your Resend API key
   - `AUTH_SECRET` = generate via `openssl rand -base64 32` in your terminal
   - `API_KEY_ENCRYPTION_KEY` = another `openssl rand -base64 32` (used to encrypt user API keys at rest)
4. **Verify on phone**: open the Vercel preview URL on your phone. Should load the empty scaffolded "Priorities" page. This is the moment your phone-deploy-test loop is confirmed.

Tell Claude Code (still on desktop): "Phase 4 infrastructure is wired and the preview URL works on my phone. Proceed with milestone 2."

**You now move to phone for the rest of the build.**

## Phase 5: The iteration loop (phone)

From here it's pure phone:

1. Open `claude.ai/code` on your phone (or the Claude iOS app's Claude Code tab) — same session can continue, or start fresh and re-attach docs
2. Send a request to Claude Code (e.g., "now build milestone 3, then push")
3. Claude Code commits and pushes to GitHub
4. Vercel auto-deploys; preview URL refreshes within ~60 seconds
5. Open the URL on your phone, test the change
6. Report back: "looks good, continue" OR "the X button isn't working on mobile, fix it"

Walking helps. You'll be surprised how much you can move through.

## When to step back to desktop during the build

Phase 5+ is phone by default, but a few things during the build are genuinely faster on desktop. When you hit one of these, jump to a desktop session, do the thing, then go back to phone:

- Initial schema migrations (Drizzle Kit CLI is much nicer in a real terminal)
- Debugging weird database state issues
- Visual review of UI changes that need multi-pane comparison
- Tweaking Verbatim Prompts (long text edits)
- Reading through long error logs in Vercel

## When something breaks

If Claude Code's output starts drifting from the TDD (paraphrased prompts, invented schemas, skipped acceptance criteria), say: "This isn't matching the TDD. Re-read [section name] and fix." The TDD is authoritative; you can always point Claude back to it.

If something silently doesn't work and you're not sure why: check the Vercel function logs in the Vercel dashboard. Most v1 issues surface there.

## End-to-End Journey: From This Chat to MVP

A realistic step-by-step. Time estimates assume part-time evening/weekend pace; concentrated days will be much faster.

### Today (right now): Save the design package

Download or save each output file somewhere accessible from your desktop (for setup) and your phone (for build iteration) — iCloud Drive, Google Drive, Dropbox, whatever syncs. The critical ones for the build are TDD + FDD + project-status. The others are owner reference.

**Time investment**: 5 minutes.

### Day 1, morning (desktop): Account setup

Anthropic, GitHub, Vercel, Neon, Resend. Add $20 in Anthropic credits. Save your keys (Anthropic API key, Neon connection string, Resend API key) somewhere safe.

**Time investment**: ~30-45 minutes.
**Cost**: $20 in Anthropic credits.

### Day 1, afternoon (desktop): First Claude Code session

Open `claude.ai/code`. Paste the handoff prompt. Attach the three docs. Review Claude Code's plan in plan mode. Approve milestone 1.

Claude Code scaffolds the project (Next.js + Tailwind + Drizzle + Lucia + Resend setup, GitHub repo created and pushed). Mostly waiting time.

**Time investment**: ~30 minutes active, plus waiting.
**Outcome**: Empty deployable Priorities app pushed to GitHub.

### Day 1-2 (desktop): Wire infrastructure

Connect GitHub → Vercel, connect Neon, add env vars. Open Vercel preview URL on phone — should load the empty scaffolded page. The phone-deploy-test loop is now live.

**Time investment**: ~30-45 minutes.
**Outcome**: Infrastructure live. Phone iteration loop confirmed. **Desktop work is done.**

### Days 2-X (phone): Build the manual council manager (TDD milestones 2-9)

Auth, settings, Priorities table + Council Home with drag-to-reorder, manual Priority CRUD, Priority Detail with full edit, pause/archive, Quarters table, Tasks/Events tables with manual CRUD, Daily View.

**This is the first useful version of Priorities.** Even with no AI yet, you have a council you can build by hand, edit, drag-to-reorder, plus manual tasks/events/Daily View. You'll surface UX issues early before AI lands on top.

**Time investment**: ~10-15 hours active iteration. 2-4 focused days, or 2-3 weeks of evening sessions.
**Outcome**: Manual Priorities is live. You're using it daily.

### Days X-Y (phone): Calendar feeds + AI features (TDD milestones 10-17)

Calendar feed config + .ics ingestion + cron, then the big AI subsystems — Quarter Planning chatbot, Weekly Planning chatbot, Daily Planning chatbot (3-step evening review), Re-planning mode picker, Master Chat preview/confirm with full screen context.

**This is when Priorities becomes Priorities.** The council walkthroughs work; master chat routes natural language to the right Priority and previews changes; calendar feeds pull in your actual meetings.

**Time investment**: ~12-18 hours active iteration. The 3 separate planning chatbots and Master Chat preview/confirm flow are the most complex pieces; expect a few sessions to land each cleanly.
**Outcome**: AI Priorities is live.

### Days Y-Z (phone): Onboarding + polish (TDD milestones 18-20)

Onboarding Coach + Council Proposal Review (the magical first-run experience). Cost surfacing in Settings. Final polish pass on error states / empty states / loading skeletons / conflict feedback / weekly time tracking display per Priority. PWA manifest + service worker.

**Time investment**: ~6-10 hours active.
**Outcome**: v1 complete. PWA installable. Acceptance criteria pass.

### Total realistic timeline

- **Concentrated weekends/days**: 4-7 days of heavy focus (very intense)
- **Part-time evening/weekend pace**: 4-8 weeks
- **Casual walking-while-iterating pace**: 8-12 weeks

Bigger than Tend would have been (more surface area: 3 separate planning sessions, Onboarding Coach, full Master Chat preview/confirm). But this is the platform — sub-app extensions come later, much faster, post-v1.

### What "MVP" means here

For Priorities, MVP = TDD milestone 20 complete + 17-item acceptance criteria pass. At that point you have:

- Magic-link auth + Onboarding Coach + Council Proposal Review
- Council of Priorities with drag-to-reorder, pause/archive, hybrid knowledge base (structured core + free-form memory + attached files)
- Three planning rituals (Quarter / Weekly / Daily — same UI shape, same council walkthrough pattern)
- Daily Plan as 3-step evening review (Progress / Capture / Plan tomorrow)
- Master Chat with full screen-context awareness, auto-detect, preview, confirm
- Re-planning modes (Replan all / Adjust)
- Calendar feed integration (Outlook + Google via .ics, auto-sync cron)
- Recurrence engine (template + override pattern)
- Mid-cycle Priority onboarding banners
- Quarter auto-transition middleware
- Memory summarization at 50-entry threshold
- Cost caps + circuit breaker + cost surfacing UI
- Soft delete with selective cascade + data export
- PWA installable on phone home screen

That's the platform. Sub-app extensions come next (when a specific Priority needs serious depth like Piano Coach or Meal Planner), each multiplying the platform's value.
