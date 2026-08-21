# TalentOS operations guide

## Local setup

Use Python 3.11. From the repository root:

```powershell
conda create -n agentic python=3.11 -y
conda activate agentic
pip install -r career-agent/requirements-dev.txt
Copy-Item career-agent/.env.example career-agent/.env
Copy-Item career-agent/profile.example.json career-agent/profile.json
```

Fill the copied `.env` with only the services you intend to use. `profile.json`
contains personal career data and must remain untracked. The frontend setup is:

```powershell
Set-Location career-agent/frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Run the backend separately:

```powershell
Set-Location career-agent
uvicorn main:app --reload --port 8080
```

## Verification

The default backend suite is intentionally offline and hermetic:

```powershell
Set-Location career-agent
python -m pytest
```

For the frontend, run `npm run typecheck`, `npm run lint`, and `npm run build`
from `career-agent/frontend`. These checks do not prove that Firebase, Cloud
Run, Firestore, Vertex AI, SMTP, or a scheduler is live. Verify a controlled
authenticated request and the rendered UI separately when changing an
environment integration.

Before a documentation handoff, run `git diff --check` and confirm every new
internal Markdown link resolves in the worktree.

## Configuration reference

The committed template is [`career-agent/.env.example`](../career-agent/.env.example).
Do not copy secrets into documentation or deployment YAML.

| Group | Important variables | Notes |
| --- | --- | --- |
| Model access | `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_API_KEY` | Gemini 3.x Vertex calls use the `global` model endpoint. This is separate from the Cloud Run region. |
| Model selection | `GEMINI_MODEL`, `EVALUATOR_MODEL`, `DRAFTER_MODEL`, `FREELANCE_EVALUATOR_MODEL`, `FREELANCE_PITCHER_MODEL` | Benchmark evaluator changes before using a lower-cost model. |
| Careers sources | `*_BOARD_SLUGS`, `COMPANY_CAREER_PORTALS_JSON`, `ENABLE_*` | Only public, reviewable ATS, portal, and feed sources belong here. |
| Studio sources | `ENABLE_RFORHIRE`, `ENABLE_WWR_CONTRACT`, `ENABLE_CONTRA`, `ENABLE_PEERLIST` | Peerlist is disabled by default in the template. |
| Run limits | `MAX_JOBS_PER_RUN`, `MAX_LEADS_PER_RUN`, `BOARD_SCOUT_MAX_CANDIDATES` | Caps bound model spending and source work per trigger. |
| Storage/profile | `FIRESTORE_PROJECT`, `USER_ID`, `PROFILE_PATH` | Firestore becomes authoritative after a profile save. |
| Delivery | `DIGEST_TO_EMAIL`, `SMTP_USER`, `SMTP_PASSWORD` | Blank recipient prints a digest instead of delivering email. |
| Protection | `RUN_AUTH_TOKEN` | Optional secondary protection for cost-incurring routes. |
| Frontend | `TALENTOS_API_URL`, `NEXT_PUBLIC_FIREBASE_CONFIG`, `AUTHORIZED_EMAILS`, `TALENTOS_OWNER_EMAILS` | Kept in frontend runtime/local configuration, never in browser-exposed secrets. |

## Deployment model

The repository includes a Python `Dockerfile`, `cloudrun-env.yaml`, and Firebase
App Hosting configuration. The intended production layout is:

1. Build and deploy the backend container to an IAM-protected Cloud Run service.
2. Mount the candidate profile and delivery credentials from Secret Manager.
3. Give the Next.js server-side proxy permission to invoke the private backend;
   do not expose the backend credential to the browser.
4. Configure Firebase App Hosting environment values for the proxy URL and
   Firebase web configuration.
5. Create operator-owned Cloud Scheduler jobs that call `/run` and, if used,
   `/run-freelance` with OIDC authentication.
6. Verify `/health` through the intended access path and execute a tightly
   bounded test run before enabling an unattended schedule.

`cloudrun-env.yaml` is configuration, not proof of a live service. Check the
target project, IAM policy, Scheduler job state, secret versions, and frontend
deployment before stating a deployment is active.

## Scheduling and spend control

Keep separate scheduler jobs for Careers and Studio so their cadences and cost
budgets can be adjusted independently. Every trigger should set a bounded
`max_jobs` or `max_leads` during validation. Increase caps only after checking
run summaries, model error rates, and token/cost accounting.

The project’s documented credit guardrail is a shared Google Cloud credit:
reserve $50 for FundersAI and stop TalentOS LLM use around $80. This is a
planning guardrail, not an automated enforcement claim; verify the active
application-level limit before relying on it.

## Common checks

| Symptom | Check | Safe response |
| --- | --- | --- |
| Vertex model returns `404 NOT_FOUND` | Confirm `GOOGLE_CLOUD_LOCATION=global` for Gemini 3.x. | Do not change the Cloud Run region to `global`; it is not a deploy region. |
| Scheduled run returns `401` | Check the OIDC identity, Cloud Run Invoker IAM binding, and optional `X-Run-Token`. | Repair least-privilege bindings; do not make the service public as a shortcut. |
| No jobs/lead results | Check source flags, configured slugs, run caps, dedupe state, and pre-filter counts. | Do not silently loosen filters or mark unseen items as seen. |
| A viable listing was skipped | Inspect its stored verdict and evaluator fingerprint. | Correct profile or model configuration; eligible skips can be re-evaluated when the fingerprint changes. |
| UI cannot access data | Check Firebase token verification, server-side proxy configuration, and backend IAM. | Keep Cloud Run credentials server-side. |
| Digest did not arrive | Check recipient and SMTP configuration, then inspect console output. | Never log SMTP credentials or profile contents. |

## Operational boundaries

- No protected-site scraping, credential replay, or automated application or
  outreach submission.
- A missing budget, visa statement, or timeline is information to clarify—not
  a silent rejection.
- Persist an evaluation before marking a job or lead seen.
- Treat source failures and model failures as visible run errors; do not claim
  a complete scan if a source did not respond.
