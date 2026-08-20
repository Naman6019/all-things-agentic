# TalentOS // Careers — Job Search Pipeline (Taskmaster track)

An **AllStackLabs** product. Autonomous agent that fetches new job listings from
company career portals and popular job sites, checks each one against your hard
requirements, tells you exactly which requirement a non-match failed, and
drafts a tailored resume + cover letter for the ones that match -- then
emails you a single digest. See `../hackathon-project-plan.md` for the full
design rationale (including why this doesn't scrape LinkedIn/Indeed).

This is TalentOS // Careers, the first of two TalentOS workflows (Job Search
now, Freelance Client Pipeline -- TalentOS // Studio -- next).

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
     for companies you're targeting (find a slug from the
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

**Board Scout** -- one explicit Google Search-grounded call proposes public
employer career sources. It covers Greenhouse, Lever, Ashby, SmartRecruiters,
Workable, public Workday CXS career endpoints, and employer-published feeds or
structured job pages. Deterministic code rejects unsafe URLs and validates that
each source currently returns at least one posting before saving it to
`job_board_registry`. Normal job runs automatically merge that registry with
configured sources:

```bash
curl -X POST 'http://localhost:8080/discover-boards?max_candidates=6'
# Bounded check of newly discovered boards only:
curl -X POST 'http://localhost:8080/run?registry_only=true&max_jobs=3'
```

Run discovery weekly or manually, not before every job run. The daily job
agent reuses the cached registry without another search call.

**Review UI** -- open <http://localhost:8080/> after a run. Server-rendered
from Firestore, no build step and no external assets, so it deploys with the
service and renders offline. Three tabs: **To apply**, **Applied**, and
**Skipped** (rejections with their specific unmet requirements). `/api/jobs`
returns the same data as JSON.

Each matched job shows its JD link, why it matched, anything the posting never
stated that you should verify, a contact address with an honest confidence
label, and:

- **Open tailored resume** -- a complete resume reorganized for that posting,
  served at `/resume?job_id=...` as a printable document. Print / Save as PDF
  produces the file to attach. The model decides what to lead with and how to
  word it; layout is deterministic in `career_agent/resume_render.py`, so
  every resume looks identical and a formatting change needs no model call.
  It is a *reorganization* of your real history -- reorder, reword, drop, but
  never invent, and real numbers are preserved exactly.
- **Copy cover letter** -- one click. Falls back to `execCommand` because
  `navigator.clipboard` is unavailable on the non-HTTPS origin that
  `gcloud run services proxy` gives you.
- **Mark as applied** -- moves the job to the Applied tab. The pipeline's own
  statuses stop at `drafted`, which is where the agent's work ends; this is
  the human half of the loop, and without it there is no way to tell a job
  drafted last week from one already applied to.

The agent never submits anything. It finds, judges, drafts, and hands you the
link and the documents -- per the guardrail this project is built around.

Location matching is India/remote-first. Onsite roles outside India reach the
evaluator only when the posting explicitly offers visa sponsorship and is
junior/entry-level or asks for at most two years of experience. A remote label
is not treated as worldwide: the evaluator verifies that working from India is
actually allowed. Capped batches rotate across Board Scout discoveries, broad
feeds, and configured company boards so famous employers cannot monopolize a
run.

### Next.js product UI

The separate frontend lives in `frontend/` and is designed for Firebase App
Hosting. It adds Google and email/password sign-in, a responsive application
dashboard, evidence and missing-information panels, quick-add, tailored-resume
and cover-letter editors, and applied-status tracking.

Each material opens in a separate review window. The cover letter uses a
focused text editor; the resume keeps headline, summary, skills, experience,
projects, and education as structured fields. Human revisions are stored in
separate `edited_*` fields on the posting, so the generated draft is never
overwritten. Users can restore the generated version, copy the current cover
letter, or print the current resume to PDF. Resume export prefers the edited
version when one exists.

The hosted release is a public preview. The landing page and Firebase
registration are open, while every workspace route still verifies a Firebase
ID token before it can call the private Cloud Run service. The proxy forwards a
validated user scope to Firestore, so public accounts do not share the owner's
applications or profile. The browser never receives Cloud Run credentials, and
Cloud Run remains protected by IAM.

```bash
cd frontend
copy .env.example .env.local
npm install
npm run dev
```

Required App Hosting runtime configuration:

- `CAREER_AGENT_API_URL`: the private Cloud Run service URL.
- `AUTHORIZED_EMAILS`: optional comma-separated emergency allowlist. Leave it
  blank for public preview access; keep it out of Git.
- `TALENTOS_OWNER_EMAILS`: comma-separated owner emails that should continue to
  use the existing `owner` Firestore namespace; keep it out of Git.
- `CAREER_AGENT_RUN_TOKEN`: only required if the backend enables the optional
  second gate for spending endpoints.

New public accounts start with an empty profile rather than inheriting the
owner's resume. They can create their own Firestore-scoped preferences before
connecting a candidate profile.

App Hosting injects the registered Firebase Web App configuration in hosted
builds. Local development reads the public web configuration from
`NEXT_PUBLIC_FIREBASE_CONFIG` in `.env.local`.

**Quick-add** -- for anything the feeds miss. Use the "Add a posting you
found yourself" box on the review page, or:
```bash
curl -X POST http://localhost:8080/api/quick-add \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.linkedin.com/jobs/view/123","text":"<paste posting here>"}'
```
Quick-added postings jump the queue on the next run and skip the title
pre-filter entirely -- you chose the job deliberately, so a title heuristic
has no business overruling you.

A Greenhouse, Lever or Ashby URL is enough on its own; it gets resolved
through the same public API the pipeline already reads. **LinkedIn, Indeed,
Glassdoor and Wellfound URLs are never fetched** -- paste the posting text
and the URL is kept as the link to apply from. Automated retrieval on those
sites is what gets accounts banned, which is the whole reason they aren't
sources.

## Public work as evidence (GitHub)

Set `github_username` in `profile.json` and the pipeline pulls the candidate's
public repositories — name, language, topics, and a README excerpt — and gives
them to both model stages.

This matters more than it sounds. A resume is a summary written months ago; a
person's repositories are current and specific. In testing, a Django/Celery
posting was **skipped** as "not demonstrated in the candidate's profile" while
the candidate had a Django REST + Celery Beat + Redis project on GitHub. With
enrichment the same posting matched, and the tailored resume led with that
project and a B2B API platform — neither of which the resume mentions.

Notes on how it is wired:

- **Cached** in Firestore (`PROFILE_SOURCE_MAX_AGE_HOURS`, default 24h). A
  person's repositories change weekly at most, while a run evaluates ten
  postings, and GitHub allows 60 unauthenticated requests an hour. Set
  `GITHUB_TOKEN` to raise that to 5,000.
- **Two sizes.** The evaluator runs once per job and gets a compact form; the
  drafter runs once per match and gets full README excerpts. Both keep an
  excerpt, because most repositories have no description and the README is the
  only place the stack is stated.
- **Forks are excluded**, and both prompts state that a repository name alone
  proves nothing — more material about the candidate raises the risk the model
  embellishes.
- **Failure is non-fatal.** A rate limit or outage returns an error that is
  logged and not cached; the run drafts without it.

**LinkedIn is not supported, and cannot be.** There is no lawful automated way
to read a profile: the API is partner-gated, "Sign In with LinkedIn" returns
only name, email and photo, and scraping is prohibited by the User Agreement —
the same rule that keeps LinkedIn out of the job sources. The lawful route is
the member's own export (Settings → Get a copy of your data), which is a file
you upload rather than something this code fetches. Not yet implemented.

## Tests

```bash
pip install -r requirements-dev.txt
python -m pytest   # 201 tests, ~6s
```

Every test is offline -- no Firestore, no model calls, no network -- so the
suite runs on a fresh clone with no GCP project. Most cases came from real
board data that broke something; the matcher was rewritten twice and those
regressions are pinned.

## Deploy to Cloud Run

TalentOS // Careers is deployed as the `talentos` Cloud Run service, running
on a 12-hourly schedule.

### One-time setup

Two service accounts, each with only what it needs:

```bash
PROJECT=your-project
gcloud iam service-accounts create talentos-run
gcloud iam service-accounts create talentos-scheduler

# Runtime: Firestore + Vertex only
for ROLE in roles/datastore.user roles/aiplatform.user; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:talentos-run@$PROJECT.iam.gserviceaccount.com" \
    --role="$ROLE" --condition=None
done
```

The candidate profile holds a real resume, so it goes to Secret Manager rather
than into the image, and access is granted on that one secret rather than
project-wide:

```bash
gcloud secrets create talentos-profile --data-file=profile.json
gcloud secrets add-iam-policy-binding talentos-profile \
  --member="serviceAccount:talentos-run@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor
```

### Deploy

```bash
gcloud run deploy talentos \
  --source . --region us-central1 \
  --service-account "talentos-run@$PROJECT.iam.gserviceaccount.com" \
  --no-allow-unauthenticated \
  --env-vars-file cloudrun-env.yaml \
  --set-secrets "/secrets/profile.json=talentos-profile:latest" \
  --memory 1Gi --timeout 900 --concurrency 4 --max-instances 3
```

Use `--env-vars-file`, not `--set-env-vars`: several values contain commas
(`GREENHOUSE_BOARD_SLUGS=anthropic,scaleai,databricks`) and would be parsed
as separate variables. Set `PROFILE_PATH=/secrets/profile.json` in that file, and
mount the secret **outside** `/app` so the volume cannot shadow application
code.

### Schedule it

```bash
gcloud run services add-iam-policy-binding talentos --region us-central1 \
  --member="serviceAccount:talentos-scheduler@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/run.invoker

gcloud scheduler jobs create http talentos-run --location us-central1 \
  --schedule="0 */12 * * *" --time-zone="Asia/Kolkata" \
  --uri="$SERVICE_URL/run" --http-method=POST \
  --oidc-service-account-email="talentos-scheduler@$PROJECT.iam.gserviceaccount.com" \
  --oidc-token-audience="$SERVICE_URL" --attempt-deadline=900s
```

Invoker is granted on the service, not the project, so the scheduler account
can call this service and nothing else.

### Two things that will waste your time

- **The URL printed by `gcloud run deploy` was not the working one.** Take the
  URL from `gcloud run services describe ... --format='value(status.url)'`.
- **`/healthz` never reaches the container.** Google's frontend returns its
  own 404 for that path while every other path serves normally. The health
  endpoint is `/health`.

### Access

The service is private. To view the UI:

```bash
gcloud run services proxy talentos --region us-central1
```

`--no-allow-unauthenticated` is what keeps a stranger from triggering billable
runs or reading your job search. If you ever make the service public, set
`RUN_AUTH_TOKEN` and send it as `X-Run-Token` -- that guards `/run` and
`/api/quick-add`, though not the UI, which a browser cannot add headers to.

## What's simplified for the hackathon MVP (and the honest list of caveats)

- **Sources implemented:** Greenhouse, Lever, Ashby, SmartRecruiters and
  Workable for startup-through-MNC employer boards; explicitly configured
  public Workday CXS career endpoints; employer-published RSS/Atom, sitemap,
  JSON feed and schema.org `JobPosting` sources used by Oracle Recruiting,
  SAP SuccessFactors, iCIMS, Taleo and custom career sites; plus Arbeitnow,
  Remotive, RemoteOK and Jobicy aggregator feeds. Board Scout validates every
  discovery before the job agent consumes it. No source connector logs in,
  impersonates a recruiter, solves CAPTCHAs, or calls internal/recruiter APIs.
  The grounded discovery call is a Vertex model/search request. Notes:
  - SmartRecruiters slugs are **case-sensitive** (`BoschGroup` returns 4766
    postings, `bosch` returns 0), and its list endpoint carries no
    description, so each one costs a second request. Those are fetched lazily
    for only the jobs that survive the pre-filter and the per-run cap.
  - The SmartRecruiters list is one page of 100; pagination isn't implemented.
  - Workday CXS is the employer's external career-site interface rather than a
    contracted Workday integration. It is opt-in and may change by tenant.
    Oracle/SAP/iCIMS/Taleo are ingested only through data the employer itself
    publishes publicly; their internal recruiting APIs are not used.
  - Sitemap and Workday detail reads are bounded by
    `COMPANY_PORTAL_MAX_DETAIL_PAGES` (25 by default). Source-level failures
    are retained in each run's `source_errors` instead of disappearing.
- **429s are handled with retries, not a quota increase.** Gemini on Vertex
  runs on [dynamic shared
  quota](https://cloud.google.com/vertex-ai/generative-ai/docs/resources/dynamic-shared-quota):
  there is no per-project limit to raise and quota-increase requests do not
  apply, so a 429 means the shared pool was momentarily busy. The model is
  configured with exponential backoff (`RETRY_ATTEMPTS`,
  `RETRY_INITIAL_DELAY`, `RETRY_MAX_DELAY`).

## What a run costs

`POST /run` returns measured token usage and an estimated cost, also written
to the run doc and shown at the bottom of the review UI. A measured run:

| | |
|---|---|
| Jobs evaluated | 10 |
| Input tokens | 285,893 |
| Output tokens | 3,863 (+6,192 thinking) |
| Cost | **$0.50**, about $0.05/job |
| Wall clock | 130s |

Evaluation is roughly 89% of that: it runs once per job, while drafting runs
only once per match. Thinking tokens are about half the total, since they bill
at the output rate.

### Choosing models per stage

`EVALUATOR_MODEL` and `DRAFTER_MODEL` are set independently (both default to
`GEMINI_MODEL`), because the two stages have opposite economics: evaluation is
high-volume and cheap-to-get-right, drafting is low-volume and the only output
a human reads.

**Benchmark before switching the evaluator.** A wrong match costs one wasted
drafting call; a wrong skip hides a real job from you and you never find out.

```bash
python benchmark_evaluators.py --jobs 20 \
    --models gemini-3.6-flash,gemini-3.5-flash-lite,gemini-2.5-flash-lite
```

It fetches and pre-filters through the real pipeline path, evaluates the same
postings with each model, scores them against the first model listed, and
prints every disagreement with both models' reasoning. It writes nothing to
Firestore, so it is safe to re-run.

**Result on 20 real postings (2026-08-11), which is why the evaluator is
still `gemini-3.6-flash`:**

| model | agreement | matches found | cost | vs ref |
|---|---|---|---|---|
| `gemini-3.6-flash` (reference) | — | 5 / 20 | $0.227 | — |
| `gemini-3.5-flash-lite` | 75% | **0 / 20** | $0.029 | 7.8x |
| `gemini-2.5-flash-lite` | 80% | 3 / 20 | $0.009 | 26.7x |

Both lite tiers fail in the direction that costs you jobs: every one of
`gemini-3.5-flash-lite`'s five disagreements is a posting it skipped that the
reference matched, and it found no matches at all. The reasoning shows why --
they treat *preferred* qualifications as hard requirements ("falls short of
the preferred 8+ years"), which the instructions explicitly forbid. A ~5x
saving is not worth an evaluator that silently discards every opportunity.

Prices live in `config.MODEL_PRICES` (USD per 1M, global endpoint, standard
tier, as of 2026-08-11). Nothing detects a stale price; an unlisted model
falls back to the flash rate and is flagged in the run summary and the UI.
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
- **The profile is edited at `/profile`, and stored in Firestore.** The JSON
  file remains the bootstrap path -- a fresh install, local development, and
  the Secret Manager mount on Cloud Run. That mount is *read-only*, which is
  the reason the editor cannot write back to the file and why saved profiles
  go to Firestore instead. Firestore wins once a profile has been saved.

  Editing the profile changes its fingerprint, which puts previously skipped
  jobs back in the queue. The editor says so before you save.
- **Storage is user-scoped, but there is only one user.** Per-user documents
  are keyed `{user_id}__{job_id}` (`USER_ID`, default `owner`), and postings
  live once in a shared `jobs/` corpus with their full description. The split
  is deliberate: fetching is identical for every candidate while evaluation is
  per-candidate, so the corpus is the half that will be shared when there are
  real users. Keying by job id alone -- which is what this replaced -- breaks
  the moment a second user exists, since one user's verdict would mark the
  posting seen for everyone.

  The corpus currently stores only postings that were actually evaluated.
  Capturing all ~2,500 fetched per run would be ~2,500 writes against a
  20k/day free tier, for postings the pre-filter already discarded; that
  belongs with a shared fetch scheduler.
- **The profile is stored in Firestore once saved from the UI.** The local
  `profile.json` file is the bootstrap path — a fresh install, local development,
  and the read-only Secret Manager mount on Cloud Run. Firestore wins once a
  profile has been saved; see `config.py`'s `load_candidate_profile`.
- **Jobs are capped per run (`MAX_JOBS_PER_RUN`, default 5).** The cap is
  mandatory -- one Greenhouse board can
  return 500+ postings and the Arbeitnow feed ~175 (~1.8M characters) per page.
  Jobs are screened before the cap on two deterministic checks, so the budget
  goes to plausible roles: the title must match one of `target_titles`, and it
  must not contain a phrase from `EXCLUDE_TITLE_KEYWORDS` (staff, principal,
  director, senior...). On a 2575-posting sweep that leaves 271 -- 2059
  dropped on title, 245 on seniority. Relevant jobs are then selected
  round-robin across sources, so one high-volume company board cannot consume
  the entire run. Both filtering counts and selected source counts are
  reported in the digest and the UI, since a pre-filtered job never gets an
  individual reason.
  Note that `senior` is in the default list, which drops "Senior Engineer"
  roles asking only 3 years; remove it if you want those back.
- **Skipped jobs are re-evaluated when the evaluator changes.** Each
  `jobs_seen` marker records whether the job matched and which
  model+profile produced that verdict. A job *skipped* by a different model or
  against a different profile is offered up again; matched jobs never are.
  This is what makes trialling a cheap evaluator reversible instead of a
  one-way door. The cost: editing `target_titles` or switching
  `EVALUATOR_MODEL` puts every previously skipped job back in the queue,
  bounded per run by `MAX_JOBS_PER_RUN` but spread over several runs. Set
  `REEVALUATE_SKIPS_ON_CHANGE=false` for one verdict per job, forever.
- **`jobs_seen` is claimed after evaluation, not at fetch time.** A job is
  marked seen only once a verdict has been stored, so a
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
- GCP infra: Cloud Run (`talentos` service) + Firestore (all pipeline state).
