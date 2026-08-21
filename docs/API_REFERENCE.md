# TalentOS API reference

The backend is a FastAPI application in `career-agent/main.py`. Run it locally
from `career-agent/` with `uvicorn main:app --reload --port 8080`, then inspect
the generated contract at `http://localhost:8080/docs` or `/openapi.json`.
This guide names the stable route intent and the handwritten request fields.
The generated OpenAPI schema is authoritative for Pydantic response details.

## Authentication and request scope

| Layer | Applies to | Behavior |
| --- | --- | --- |
| Cloud Run IAM | Deployed service | Primary boundary; deployed service should remain unauthenticated only if that is an explicit operational choice. |
| `X-Run-Token` | Spending routes | Required only when `RUN_AUTH_TOKEN` is configured; otherwise it is a no-op for local development. |
| `X-TalentOS-User-Id` | User-scoped API routes | Set by the authenticated Next.js server-side proxy. Locally, its absence falls back to `USER_ID`. |

Do not send a user-scope header from an untrusted browser directly to a public
backend. The architecture assumes the backend is private and that the proxy has
already verified identity.

## Health and legacy review routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness response: `{"status":"ok"}`. Use this path, not `/healthz`. |
| `GET` | `/` | Server-rendered review UI. |
| `GET`, `POST` | `/profile` | Legacy HTML profile editor. |
| `GET` | `/resume?job_id={job_id}` | Printable tailored-resume HTML. |
| `POST` | `/applications/status` | Form action to set a grouped job status to `applied` or `drafted`. |
| `POST` | `/quick-add` | Form action that queues a manually supplied job. |

## Pipeline triggers

| Method | Route | Query fields | Result |
| --- | --- | --- | --- |
| `POST` | `/run` | `max_jobs`, `registry_only` | Runs the Careers pipeline and returns its run summary. `max_jobs` must be between 1 and `MAX_JOBS_PER_RUN`. |
| `POST` | `/discover-boards` | `max_candidates` | Runs a bounded, grounded Board Scout pass. Limit is 1–12. Only API-validated public boards are stored. |
| `POST` | `/run-freelance` | `max_leads` | Runs the Studio pipeline and returns its run summary. `max_leads` must be between 1 and `MAX_LEADS_PER_RUN`. |

All three routes use the optional run-token dependency. Trigger them through an
authenticated scheduler or an operator-controlled request; do not expose them
directly to browser clients.

## Careers JSON API

All routes in this section use user scoping.

| Method | Route | Request | Result |
| --- | --- | --- | --- |
| `GET` | `/api/jobs?status=matched` | Optional status | Grouped jobs. `matched` includes `matched` and `drafted`. |
| `GET` | `/api/profile` | — | Target titles, normalized location preferences, and sponsorship setting. |
| `PUT` | `/api/profile` | `target_titles`, `location_preferences`, `needs_visa_sponsorship` | Validates and saves search scope without replacing resume/drafting fields. |
| `POST` | `/api/quick-add` | `url`, `text`, `title`, `company` | Queues a job for the next Careers run. Also requires the run-token dependency. |
| `POST` | `/api/applications/status` | `job_id`, `status` | Sets a human-owned job status. Valid values: `matched`, `drafted`, `applied`, `skipped`. |
| `GET` | `/api/run-summary` | — | Latest Careers ingestion, filter, and cost accounting. |
| `GET` | `/api/materials?job_id={job_id}` | Job ID | Generated, edited, and effective resume/cover-letter values. |
| `PUT` | `/api/materials` | `job_id`, `material_type`, corresponding material value, optional `reset` | Saves a human edit or restores the generated value. |

Example search-preference update:

```json
{
  "target_titles": ["Machine Learning Engineer", "AI Engineer"],
  "location_preferences": [
    {"location": "India", "work_mode": "remote"}
  ],
  "needs_visa_sponsorship": false
}
```

## Studio JSON API

| Method | Route | Request | Result |
| --- | --- | --- | --- |
| `GET` | `/api/leads?status=matched` | Optional status | Leads. `matched` includes `matched` and `pitched`. |
| `GET` | `/api/leads/{lead_id}` | Lead ID | Saved lead, evaluation, and pitch. |
| `PUT` | `/api/leads/{lead_id}/status` | Form field `status` | Sets a human-owned status: `sent`, `replied`, `archived`, `matched`, or `pitched`. |
| `GET` | `/api/freelance-profile` | — | Freelance profile overlay fields. |
| `PUT` | `/api/freelance-profile` | `freelance_niche`, `freelance_availability`, `freelance_services`, `freelance_portfolio_summary` | Updates only freelance fields. |
| `PUT` | `/api/pitch` | `lead_id`, optional `pitch_message`, optional `reset` | Saves a human-edited pitch or restores the generated draft. |

## Status and error behavior

- `400`: invalid input, an invalid user identifier, or an unsupported status.
- `401`: missing or invalid run token when `RUN_AUTH_TOKEN` is configured.
- `404`: no saved job, material, lead, or pitch for the supplied identifier.
- `503`: the frontend proxy cannot reach a configured backend or lacks its
  required deployment configuration.

The API returns individual status records, but the UI may group duplicate job
postings by company and title. Updating a visible Careers card updates all
members of that review group.
