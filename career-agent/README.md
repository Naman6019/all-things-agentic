# Career Agent -- Job Search Pipeline (Taskmaster track)

Autonomous agent that fetches new job listings from mid/large-company career
portals and popular job sites, checks each one against your hard
requirements, tells you exactly which requirement a non-match failed, and
drafts a tailored resume + cover letter for the ones that match -- then
emails you a single digest. See `../hackathon-project-plan.md` for the full
design rationale (including why this doesn't scrape LinkedIn/Indeed).

This is the first of the two Career Agent workflows (Job Search now,
Freelance Client Pipeline next). The Wireframe Assistant is a separate
project/track and lives elsewhere.

## How it works

1. Cloud Scheduler (or you, manually) hits `POST /run` on the Cloud Run
   service.
2. The ADK agent (`career_agent/agent.py`) runs a single pass: load your
   profile -> fetch unseen jobs -> evaluate each one -> tailor materials for
   matches -> send one digest email.
3. All state (which jobs have been seen, evaluations, drafts) lives in
   Firestore, not in agent session memory -- each run is a fresh, stateless
   agent invocation, which is why `InMemorySessionService` is enough here
   (see the comment in `main.py`).

## Setup

1. `conda create -n agentic python=3.11 -y && conda activate agentic`
   (the `python=3.11` matters -- `conda create -n agentic` on its own makes an
   env with no interpreter, and `conda run -n agentic python` then silently
   falls through to whatever Python is on PATH)
2. `pip install -r requirements.txt`
3. `cp .env.example .env` and fill in:
   - A GCP project with Vertex AI enabled (or a `GOOGLE_API_KEY` from AI
     Studio if you'd rather call the Gemini API directly instead of Vertex)
   - Leave `GOOGLE_CLOUD_LOCATION=global` -- the Gemini 3.x models are only
     served on Vertex's global endpoint and 404 on regional ones
   - `GREENHOUSE_BOARD_SLUGS` / `LEVER_BOARD_SLUGS`: comma-separated slugs
     for the mid/large companies you're targeting (find a slug from the
     company's careers page URL -- `boards.greenhouse.io/<slug>` or
     `jobs.lever.co/<slug>`)
   - `DIGEST_TO_EMAIL` and `SMTP_USER`/`SMTP_PASSWORD` (a Gmail app password
     works) so the digest actually reaches you instead of just printing to
     the console
4. `cp profile.example.json profile.json` and fill in your real target
   titles, hard requirements, and resume text.
5. Set up Application Default Credentials for Firestore:
   `gcloud auth application-default login` (local dev) -- Cloud Run picks up
   its service account automatically once deployed.

## Run it

**Interactive demo** (best for the hackathon video -- shows the agent
reasoning and calling tools live):
```bash
adk web .
```

**Headless, one pass** (what Cloud Scheduler will call in production):
```bash
uvicorn main:app --reload
curl -X POST http://localhost:8080/run
```

**Review UI** -- open <http://localhost:8080/> after a run. Server-rendered
from Firestore, no build step and no external assets, so it deploys with the
service and renders offline. Shows each matched job with its JD link, why it
matched, anything the posting never stated that you should verify, and the
drafted resume bullets and cover letter. `?status=skipped` shows the
rejections with their specific unmet requirements, and `/api/jobs` returns
the same data as JSON.

It is read-only on purpose: it links out to the posting rather than
submitting anything, per the guardrail this project is built around.

## Deploy to Cloud Run

```bash
gcloud run deploy career-agent \
  --source . \
  --region "$CLOUD_RUN_REGION" \
  --set-env-vars "$(grep -v '^#' .env | xargs | tr ' ' ',')" \
  --no-allow-unauthenticated
```

Then create a Cloud Scheduler job with an OIDC token targeting the service's
`/run` URL, and grant the Scheduler service account the Cloud Run Invoker
role. `--no-allow-unauthenticated` plus that grant is what keeps `/run` from
being triggerable by anyone who finds the URL -- this repo does not add its
own auth check on top of that yet, so don't skip it.

## What's simplified for the hackathon MVP (and the honest list of caveats)

- **Sources implemented:** Greenhouse, Lever, Ashby and SmartRecruiters for
  company boards; Arbeitnow, Remotive, RemoteOK and Jobicy as aggregator
  feeds. All are free, public and keyless. Two notes:
  - SmartRecruiters slugs are **case-sensitive** (`BoschGroup` returns 4766
    postings, `bosch` returns 0), and its list endpoint carries no
    description, so each one costs a second request. Those are fetched lazily
    for only the jobs that survive the pre-filter and the per-run cap.
  - The SmartRecruiters list is one page of 100; pagination isn't implemented.
- **Vertex quota is the current ceiling on `MAX_JOBS_PER_RUN`.** A run of 25
  jobs hit `429 RESOURCE_EXHAUSTED` partway through on a new GCP project.
  The cap is set to 10; raise it after requesting a Vertex AI quota increase.
- **Contact-finding is a regex + optional Hunter.io fallback**, not a real
  enrichment service. It's intentionally conservative: it only returns
  "high confidence" when it found an actual email in the posting text or
  from Hunter, and clearly flags a `pattern_guess` as `low` confidence so
  you know to double check before sending.
- **Digest email is plain SMTP** (e.g. a Gmail app password), not the Gmail
  API/OAuth. Swap `career_agent/tools/notify.py`'s `_send_smtp` for a Gmail
  API call if you'd rather not use an app password; nothing else needs to
  change.
- **No auth on `/run` by default** -- see the Deploy section above. Fine for
  local testing, not fine to leave open once deployed.
- **The profile lives in a local `profile.json`, not Firestore.** Simpler to
  hand-edit for now; move it into a Firestore doc later if you want to edit
  it from a UI instead of a file (see the docstring in `config.py`).
- **Jobs are capped per run (`MAX_JOBS_PER_RUN`, default 5) and there is no
  relevance pre-filter yet.** The cap is mandatory -- one Greenhouse board can
  return 500+ postings and the Arbeitnow feed ~175 (~1.8M characters) per page.
  But because the cap currently takes the first N unseen jobs in feed order
  rather than the N most relevant, a run can spend its whole budget on postings
  nowhere near your target titles. A first smoke run against the `discord`
  board did exactly that: 5 jobs evaluated, 5 skipped, all non-engineering.
  Filtering on title/location before the cap is the next fix.
- **`jobs_seen` is claimed after evaluation, not at fetch time.** A job is
  marked seen only once `record_job_evaluation` has stored a verdict, so a
  run that dies partway leaves its in-flight jobs available to the next run.
  This was originally the other way round and cost real jobs: a run hit a
  Vertex 429 after 14 of 25 and orphaned the remaining 11 -- marked seen, so
  never retried, and unevaluated, so never surfaced. The trade-off is that
  two runs overlapping in time may both evaluate the same job, which is far
  cheaper than losing one silently.
- **Sending the actual application/apply-click stays manual, on purpose** --
  see the guardrails section in `../hackathon-project-plan.md`. This agent
  drafts and finds; you send.

## Hackathon requirement mapping

- Gemini 3.6 Flash (`gemini-3.6-flash`) via Vertex AI's global endpoint --
  configurable via `GEMINI_MODEL` in `.env`. `gemini-3.5-flash` also works;
  `gemini-3.6-pro` is not currently available.
- Google agent framework: ADK (`google-adk`), `LlmAgent` in
  `career_agent/agent.py`.
- GCP infra: Cloud Run (this service) + Firestore (all pipeline state).
