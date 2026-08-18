# All Things Agentic Hackathon — Project Plan

Two submissions, each aimed squarely at one track's rubric:

| # | Project | Track | Deadline pacing |
|---|---|---|---|
| 1 | **TalentOS // Careers** (Job Search Pipeline) | Taskmaster | Primary build — do this first |
| 2 | **TalentOS // Studio** (Freelance Client Pipeline) | Taskmaster | Secondary build — after #1 has a working end-to-end demo |

Today is Aug 11, submission closes Aug 31 (5:00pm PDT) — 20 days. Treat TalentOS // Careers as the thing that must work end-to-end no matter what; everything else is additive.

---

## A critical guardrail before any of this gets built

Both "outreach" workflows touch platforms with strict anti-automation rules, and this shapes the architecture, not just a footnote:

- **Upwork** explicitly bans any tool that submits a proposal without a human click — bots, headless browser automation, or unauthorized API use trigger permanent, non-appealable suspension. What *is* allowed: monitoring job feeds, scoring fit, drafting proposals, extracting posting details, tracking status. The line is the send action.
- **LinkedIn** prohibits scraping and automated actions outright (User Agreement §8.2) — bans are common and can happen without warning, especially at "no human could do this" velocity (200+ connections/day, 100+ messages in hours).
- **Indeed** has an undocumented automated-submission threshold (roughly 30–50/day) before flags trigger, and scraping the site instead of using official channels is likewise risky.
- Plain **email** (Gmail API/SMTP) to a publicly listed address isn't governed by any of this — it's just email.

Design consequence: the agent does all the *work* — finding, matching, drafting, personalizing — autonomously. The actual "click send" on any platform-mediated flow (Upwork proposal, LinkedIn message, Indeed apply) stays a one-click human approval step. This isn't a compromise on "autonomous" — it's the safer, more production-minded design, and it directly helps your score on the "Architectural Discipline" criterion (30% of judging), which explicitly rewards handling failure modes and credentials/guardrails properly rather than a brittle script that gets your account banned mid-demo.

---

## Part 1 — TalentOS // Careers (Taskmaster track)

### Why this fits Taskmaster
Event-driven (new listing/lead appears) → autonomous routing across systems (job board → matcher → resume tailoring → contact lookup → draft → notify) → ends in a concrete artifact, not a chat reply. Exactly the "don't just write text, take action" bar the track sets.

### Shared foundation (used by both workflows)
- **User Profile** (Firestore): master resume, target titles, hard requirements (years experience, must-have skills/certs, location/remote, salary floor, visa needs), portfolio links, freelance niche + rate, writing-voice samples for drafting.
- **Gemini 3.5** (via Gemini API or Vertex AI) does the reasoning: requirement matching, gap explanation, resume tailoring, message drafting.
- **ADK** orchestrates both workflows as tools/sub-agents under one agent service.
- **Cloud Run** hosts the agent; **Firestore** holds state, dedupe records, and the approval queue.
- **Notification**: email digest (Gmail API) or a simple in-app queue — whichever you already have credentials for.

### Workflow A — Job Search Pipeline

1. **Trigger**: Cloud Scheduler → Pub/Sub → Cloud Run, on a cadence (e.g. every 6–12h), or manual "run now."
2. **Fetch listings** — `fetch_job_listings(sources)`, tuned for the target: mid-to-large companies, covered via both their own career portals and the popular job sites:
   - **Mid/large-company career portals** (primary source): most companies at this size run postings through Greenhouse, Lever, Ashby, SmartRecruiters, or Workday — each exposes a free, public, per-company board API (just needs the company's board slug/token, no scraping). Maintain a growing list of target companies' board slugs as you identify them.
   - **Popular job sites** (LinkedIn, Indeed, Glassdoor, etc.): no safe bulk-scraping or auto-search path on these (see guardrails above). Cover them via aggregator feeds that re-publish from these sources — Arbeitnow, Remotive, RemoteOK, JobsPipe/LoopCV — plus a "quick add" where you paste a specific posting URL/text in manually for anything the feeds miss.
   - If you name specific boards/companies, the agent prioritizes those first.
3. **Match & gap-check** (LLM call) — for each new listing, compares title + description against your stored requirements and returns a structured verdict:
   ```json
   {"match": false, "title": "Senior Backend Engineer", "unmet_requirements": ["Requires 8+ yrs, profile has 5", "On-site only, profile requires remote"], "reasoning": "..."}
   ```
   This is the piece you specifically asked for — every non-match gets a reason, not a silent drop.
4. **If match** → tailor resume + draft cover letter from the listing + your master resume; look up a hiring contact starting with publicly published info (company site, the posting itself, common `careers@`/named-contact patterns) — not LinkedIn profile scraping. If that doesn't turn up a reliable contact, fall back to an email-finder API (Hunter.io) to fill the gap.
5. **If no match** → logged with the specific unmet requirement(s), included in your digest so you see what to fix (resume gap, or the filter being too strict).
6. **Output**: a digest — matched jobs with tailored materials ready for one-click send/apply, and skipped jobs with reasons.
7. **State**: Firestore collections `jobs_seen` (dedupe by listing ID), `applications` (status: matched / skipped / drafted / sent).

### Workflow B — Freelance Client Pipeline

1. **Trigger**: same scheduler, or on-demand.
2. **Find leads** — since Upwork/Fiverr can't be scraped or auto-proposed into, lean on channels that are actually open. MVP leans on public hiring boards first; a target-list upload is a later add-on, not required for the demo:
   - **Public "hiring" boards/feeds** (r/forhire-style, We Work Remotely "hire" postings, Contra, Peerlist, etc.) — primary MVP source.
   - Upwork/Fiverr job feeds can still be *monitored and scored* (that's explicitly allowed) — the agent flags good-fit postings for you to open and submit yourself, rather than attempting to submit for you.
   - Optional stretch: a target list *you* upload (companies/people matching your ideal client profile) for cold outreach, once the hiring-board flow is working.
3. **Enrich** each lead with public info (company site/about page) for personalization.
4. **Draft outreach** (LLM) — a pitch referencing your portfolio/past work relevant to what the lead needs.
5. **Approval gate**:
   - Platform-mediated (Upwork/Fiverr proposal) → always queued for your manual click, no exceptions.
   - Plain email/DM to a publicly listed address → can be sent automatically via Gmail API once you trust the drafts, but default to human-approve first, especially while you're new to this and calibrating tone/targeting.
6. **Notify** — once a batch is drafted (or sent, if auto-send is on), the agent sends you a summary: who, via what channel, link to the draft/log. This is the "once done, notify the user" step you asked for.
7. **State**: Firestore `leads`, `outreach_log` (status: drafted / approved / sent / replied).

### MVP cut line for the deadline
Must-have for a working demo: Job workflow, one or two board sources, matching + gap explanation, tailored resume draft, digest output. Freelance workflow and the contact-finder/email-finder integration are the first things to trim if time runs short — the Job workflow alone is a complete, judgeable Taskmaster story.

---

## Part 2 — TalentOS // Studio (Freelance Client Pipeline)

### Why this fits Taskmaster
Same event-driven, action-ending pattern as Careers: new lead appears → autonomous routing across systems (board → matcher → pitch drafter → notify) → ends in a concrete artifact (a drafted pitch with a deep-link to send), not a chat reply. Both agents share one product, one profile, one auth — a unified opportunity intelligence workspace.

### Flow
1. **Trigger**: same Cloud Scheduler, or on-demand.
2. **Find leads** — public hiring boards and freelance feeds:
   - **r/forhire** ("Hiring" posts) — public RSS, no auth.
   - **We Work Remotely** (contract/freelance category) — public RSS.
   - **Contra / Peerlist** — public project listings, monitor only.
3. **Enrich** each lead with public info for personalization.
4. **Draft outreach** (LLM) — a pitch referencing the freelancer's portfolio/past work relevant to the lead's stated pain points.
5. **Approval gate**: the agent drafts the pitch and provides a deep-link to the platform. The human clicks send — no exceptions, no auto-submission.
6. **Notify** — once a batch is drafted, the agent sends a digest: who, via what channel, link to the pitch.
7. **State**: Firestore `leads`, `leads_seen`, `pitches`, `freelance_runs`.

### MVP cut line
Must-have for a working demo: one or two freelance sources, lead evaluation with gap explanation, drafted pitch with deep-link, digest output.

---

## Tech requirement checklist

- [x] Gemini 3.5 or newer via Gemini API or Vertex AI — running on `gemini-3.6-flash` via Vertex. Note it is only served on Vertex's **global** endpoint; regional locations 404.
- [x] At least one Google agent framework — ADK for both agents, per this plan
- [x] At least one GCP infra service — Firestore is live (native mode, `us-central1`, project `allthingsagentic-505213`); Cloud Run service deployed and running on a 12-hourly schedule
- [ ] Demo video shows the backend actually running on Google Cloud (Cloud Run dashboard / Vertex AI logs / the `.run.app` URL)
- [x] Architecture diagram, README with spin-up steps, code repo

## Scope decisions (resolved)
1. ~~**Job boards**~~ — Resolved: targeting mid-to-large companies, tracked through their own career portals (Greenhouse/Lever/Ashby/SmartRecruiters/Workday) plus popular job sites (LinkedIn, Indeed, Glassdoor, etc.) via aggregator feeds + quick-add, per the source strategy in Workflow A.
2. ~~**Contact-finding**~~ — Resolved: start with publicly listed info; fall back to an email-finder API (Hunter.io) when public info isn't reliable enough.
3. ~~**Freelance leads**~~ — Resolved: MVP leans on public hiring boards first; target-list upload is a later add-on.
4. ~~**Send channel**~~ — Resolved: Gmail API (your account) for the notification digest and any auto-sent plain-email outreach.
5. ~~**Build order**~~ — Resolved: TalentOS // Careers first, then TalentOS // Studio. Both are Taskmaster track submissions — one product, two agents.
6. ~~**Second submission**~~ — Resolved (Aug 19): the Wireframe Assistant / Collaborative Partner track is **out of scope**. Both agents (Careers + Studio) submit under the Taskmaster track as a single unified product. Focus entirely on making both agents excellent.
