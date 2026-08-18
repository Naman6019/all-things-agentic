# AGENTS.md — TalentOS Developer & Agent Guide

> **Context**: This repository is built for the **All Things Agentic Hackathon** (Submission Target: August 31, 2026).
> 
> **Product**: **TalentOS** — An AllStackLabs product. Autonomous opportunity intelligence and dual-stream career agent.
> 
> **Tracks**:
> 1. **Primary Submission (Taskmaster Track)**: **TalentOS // Careers** — Autonomous, event-driven career pipeline that discovers listings across public ATS and aggregators, validates hard/soft requirements via per-job reasoning, generates tailored materials, and ends in concrete artifacts (email digest, reviewable UI, print-ready tailored resumes).
> 2. **Secondary Submission (Taskmaster Track)**: **TalentOS // Studio** — Autonomous freelance client pipeline that monitors public hiring boards, scores fit via per-lead reasoning, and drafts high-conversion client pitches with deep-link send assistance.

---

## 1. Core Architectural Tenets

When modifying, extending, or maintaining this codebase, every agent and human developer MUST adhere to these foundational principles:

### A. The Model is NOT the Control Flow
- Fetching, deduplication, deterministic pre-filtering, rate-capping, database updates, and digest dispatching are executed in **standard Python**, not by an autonomous loop agent.
- LLM calls are strictly reserved for tasks requiring qualitative judgment: evaluating candidate fit and drafting tailored materials.
- **Why**: Multi-turn "agentic loop" conversations accumulate token history quadratically (~4× more expensive) and risk dropping tasks or hallucinating completion. Single-job isolated invocations (`_ask`) ensure constant per-job cost and deterministic error handling.

### B. Cheap Filters Before Expensive Evaluation
- Deterministic title, seniority, work mode, and location pre-filtering drops ~90%+ of irrelevant postings before any Vertex AI invocation.
- **Accounting Rule**: Pre-filtered jobs must never disappear silently. Every dropped posting is counted by reason (`title_not_in_target_titles`, `title_above_target_seniority`, etc.) and included in the run summary and digest.

### C. Strict 3-State Qualification Logic
When judging candidate fit against job descriptions:
1. **MET**: The posting explicitly states a requirement that the candidate demonstrable satisfies.
2. **UNMET**: The posting explicitly states a requirement that the candidate demonstrably fails (e.g., *"Requires 8+ years, profile has 1"*).
3. **NOT STATED**: The posting is silent about the requirement (e.g., salary, visa sponsorship, exact years). **Silence is never a rejection.** Silent items are tagged as `missing_information` for candidate verification.

### D. Hard Anti-Automation & Platform Guardrails
- **No Direct Bot Submissions**: Under no circumstances should automated submission bots be built for Upwork, LinkedIn, Indeed, or Glassdoor. These platforms enforce strict anti-automation terms of service.
- **Human-in-the-Loop**: The agent finds, filters, scores, enriches, and drafts application materials. The final "Send", "Apply", or "Submit" action is strictly reserved for a single-click human action.
- **No Scraping of Protected Sites**: Ingestion is restricted to public, keyless ATS APIs (Greenhouse, Lever, Ashby, SmartRecruiters) and official open aggregator feeds (Arbeitnow, Remotive, RemoteOK, Jobicy).

### E. Durable Deduplication Order
- Firestore dedupe marker (`jobs_seen`) is written **ONLY AFTER** the job verdict has been durably stored in Firestore (`applications`).
- **Why**: Marking seen at fetch time burns listings if the run encounters a transient 429 quota error or network failure mid-batch.

### F. Reversible Evaluations via Fingerprinting
- Skipped jobs carry an `evaluator_fingerprint` (hash of the evaluator model, profile target titles, and seniority rules).
- If the candidate profile changes or a new evaluator model is configured, previously skipped jobs can be re-evaluated on subsequent runs. Matched jobs are never re-evaluated.

---

## 2. Repository Map

```
ALLThingsAgentic/
├── AGENTS.md                         # This file: definitive guidelines for AI agents & contributors
├── README.md                         # Project overview, architecture diagram, and track pitch
├── CONTRIBUTING.md                   # Development setup and offline testing rules
├── hackathon-project-plan.md         # Full project roadmap, design rationale, and track rubrics
│
└── career-agent/                     # TalentOS Service (Python / Google ADK / FastAPI)
    ├── main.py                       # FastAPI entrypoint (/run, /run-freelance, /health, /profile, /api/*)
    ├── benchmark_evaluators.py       # Offline empirical model evaluator comparison harness
    ├── Dockerfile                    # Container definition for Cloud Run deployment
    ├── cloudrun-env.yaml             # Cloud Run environment variables configuration
    ├── profile.json / profile.example.json  # Candidate master profile and resume text
    ├── pytest.ini                    # Pytest configuration (offline, strict markers)
    ├── requirements.txt              # Production runtime dependencies (FastAPI, ADK, GenAI, Firestore)
    ├── requirements-dev.txt          # Test dependencies (pytest, pytest-asyncio)
    │
    ├── career_agent/                 # Core Python Package
    │   ├── agent.py                  # ADK LlmAgent definitions (Evaluator, Drafter, Freelance Evaluator, Freelance Pitcher)
    │   ├── pipeline.py               # Legacy linear control flow (fallback path)
    │   ├── graph.py                  # LangGraph orchestration: TalentOS // Careers pipeline
    │   ├── freelance_graph.py        # LangGraph orchestration: TalentOS // Studio pipeline
    │   ├── config.py                 # Environment variables, model pricing table, token math
    │   ├── matching.py               # Deterministic pre-filter regex and phrase-matching engine
    │   ├── board_scout.py            # Grounded Google Search discovery of public ATS career boards
    │   ├── models.py                 # Core Dataclasses (JobListing, ClientLead, CandidateProfile, etc.)
    │   ├── schemas.py                # Pydantic Structured Outputs (JobVerdict, LeadVerdict, DraftedMaterials, PitchDraft)
    │   ├── resume_render.py          # Deterministic HTML/print-ready CSS resume generator
    │   ├── quickadd.py               # Manual job posting intake & direct text evaluation
    │   ├── profile_ui.py             # Form UI for candidate profile editing
    │   ├── review_groups.py          # Application grouping by (company, title) for review surfaces
    │   ├── webui.py                  # Self-contained server-rendered review dashboard
    │   ├── telemetry.py              # Langfuse observability and tracing layer
    │   │
    │   ├── sources/                  # Data Ingestion Modules
    │   │   ├── ats_boards.py         # Greenhouse, Lever, Ashby, SmartRecruiters API clients
    │   │   ├── aggregators.py        # Arbeitnow, Remotive, RemoteOK, Jobicy feed parsers
    │   │   ├── freelance_boards.py   # r/forhire, WWR, Contra freelance gig feed parsers
    │   │   ├── company_portals.py    # Workday, Workable, RSS/sitemap/schema.org employer portals
    │   │   ├── profile_sources.py    # Public GitHub repository enrichment
    │   │   └── text_utils.py         # HTML stripping and text normalization
    │   │
    │   ├── storage/
    │   │   └── firestore_store.py    # Multi-tenant Firestore operations (jobs, leads, applications, pitches)
    │   │
    │   └── tools/
    │       ├── job_tools.py          # Batch ingestion orchestration and public contact lookup
    │       └── notify.py             # Email digest formatter and SMTP dispatcher (Careers + Studio)
    │
    ├── tests/                        # 235+ Hermetic, offline test suite
    │   ├── test_matching.py          # Real ATS title pre-filter regression tests
    │   ├── test_board_scout.py       # Candidate normalization & ATS API validation tests
    │   ├── test_cost.py              # Token accounting and pricing model tests
    │   ├── test_contact.py           # Email heuristic & confidence scoring tests
    │   ├── test_quickadd.py          # Text extraction and URL validation tests
    │   ├── test_resume_render.py     # HTML resume structure & layout tests
    │   ├── test_freelance_sources.py # Freelance board parser tests (r/forhire, WWR, Contra)
    │   ├── test_freelance_graph.py   # Freelance LangGraph orchestration tests
    │   ├── test_freelance_api.py     # Freelance FastAPI endpoint tests
    │   ├── test_profile_sources.py   # GitHub metadata prompt format tests
    │   ├── test_langgraph_pipeline.py # LangGraph state machine orchestration tests
    │   └── ...                       # Additional tests (telemetry, materials, profile, status, etc.)
    │
    └── frontend/                     # Modern Next.js 15 Web Application (Firebase App Hosting)
        ├── src/
        │   ├── app/                  # Next.js App Router (landing page, /jobs, /freelance, settings, pitch editor)
        │   ├── components/           # UI components (agent-launcher, career-dashboard, freelance-dashboard, pitch-editor, auth-screen)
        │   └── lib/                  # Firebase Auth, Admin SDK, and Cloud Run proxy client
        ├── apphosting.yaml           # Firebase App Hosting deployment config
        └── package.json              # Next.js, React 19, Tailwind CSS dependencies
```

---

## 3. Technology Stack & Google Cloud Ecosystem

| Component | Technology | Configuration & Notes |
|---|---|---|
| **Agent Framework** | **Google ADK** (`google.adk`) | `LlmAgent`, `Runner`, `InMemorySessionService` per-job |
| **State Graph & Workflow** | **LangGraph** (`langgraph`) | State machine, conditional routing, and batch looping (`career_agent/graph.py` & `freelance_graph.py`) |
| **Observability & Tracing** | **Langfuse** (`langfuse`) | Production generation tracing, token accounting, latency & fit scores (`career_agent/telemetry.py`) |
| **Foundation Models** | **Gemini 3.6 Flash** / **Gemini 3.5 Flash** | Served via **Vertex AI** (`GOOGLE_CLOUD_LOCATION=global`) |
| **Model Grounding** | **Google GenAI Search Grounding** | Used in `board_scout.py` for discovering live career boards |
| **Compute / Runtime** | **Google Cloud Run** | Private service (`--no-allow-unauthenticated`), OIDC invoked |
| **Orchestration** | **Google Cloud Scheduler** | Triggers `POST /run` (12h) & `POST /run-freelance` (6h) with OIDC SA |
| **State & Memory** | **Google Cloud Firestore** | Native mode (`us-central1`), user-scoped document IDs |
| **Secrets Management**| **Google Secret Manager** | Profiles mounted at `/secrets/profile.json` |
| **Frontend UI** | **Next.js 15 / Firebase App Hosting**| Private beta gated via Firebase Auth ID tokens |

> [!IMPORTANT]
> **Vertex AI Location Requirement**:
> Gemini 3.x models (`gemini-3.6-flash`, `gemini-3.5-flash`) are exclusively served on Vertex AI's **global** endpoint. Specifying regional locations such as `us-central1` will result in HTTP 404 NOT_FOUND errors. Always set `GOOGLE_CLOUD_LOCATION=global`.

---

## 4. Agent Prompts & Structured Schemas

### A. Evaluator Agent (`career_agent/agent.py`)
- **Input**: Candidate Profile (skills, experience, preferences) + Public GitHub Work Summary + Cleaned Job Listing text.
- **Output Schema (`JobVerdict`)**:
  ```python
  class JobVerdict(BaseModel):
      match: bool
      match_strength: Literal["strong", "medium", "weak"]
      unmet_requirements: list[str]      # Empty when match=True
      missing_information: list[str]     # Items not stated in posting (e.g. salary)
      reasoning: str                     # Plain-language justification
  ```
- **Rule**: Never reject for missing salary, visa info, or employer prestige. Reject only for hard scope mismatches (e.g. Staff/Principal ownership required when candidate has 1 year experience).

### B. Drafter Agent (`career_agent/agent.py`)
- **Input**: Candidate Master Resume + Candidate Profile + Public GitHub Work Details + Matched Job Description.
- **Output Schema (`DraftedMaterials`)**:
  ```python
  class DraftedMaterials(BaseModel):
      tailored_resume: TailoredResume    # Reorganized real experience & tailored bullets
      cover_letter: str                  # 150-250 word targeted cover letter
  ```
- **Rule**: Reorder, reword, and align vocabulary toward the job description. **NEVER fabricate skills, metrics, employer names, or employment dates.**

### C. Freelance Evaluator & Pitcher Agents (`career_agent/agent.py`)
- **Evaluator Input**: Freelance profile (niche, services, rate, portfolio summary) + Lead Description.
- **Pitcher Output Schema (`PitchDraft`)**:
  ```python
  class PitchDraft(BaseModel):
      pitch_message: str                 # 100-200 word direct client pitch
      relevant_portfolio: list[str]      # Verified links from profile & GitHub
      suggested_rate: str                # Hourly / fixed-rate anchor
      contact_method: str                # Recommended outreach platform
  ```

### D. Board Scout (`career_agent/board_scout.py`)
- **Mechanism**: Google Search Grounding with Gemini queries the web for companies hiring in candidate's domain on supported ATS platforms.
- **Validation**: Output candidate slugs are filtered against a strict regex and verified via live HTTP GET against public ATS API endpoints before saving to `job_board_registry`.

---

## 5. Development & Testing Conventions

### A. Codebase Exploration & Knowledge Graph (Graphify)
- **Codebase Search**: Use **Graphify** (`graphify`) for searching through the codebase, tracing structural dependencies, and mapping relationships between modules, agents, and pipelines.
- **Graph Synchronization**: Update the knowledge graph after iterations or whenever new components, services, or data flows are added or refactored so that the graph accurately reflects the current codebase state (`graphify update .`).

### B. Hermetic Offline Testing
All standard tests in `tests/` must execute without internet access, GCP credentials, or live database instances.
```bash
# Run the test suite from career-agent directory:
cd career-agent
python -m pytest -o markers="asyncio: asyncio tests" -o markers="network: network tests"
```

### C. Measuring Model Performance Before Cost Optimization
Never switch `EVALUATOR_MODEL` based on assumptions. Always run the benchmarking harness:
```bash
python benchmark_evaluators.py --jobs 20 --models gemini-3.6-flash,gemini-3.5-flash-lite,gemini-2.5-flash-lite
```
*Note*: False skips are critically penalizing (they hide viable jobs from the user), whereas false matches only incur a single drafting call.

### D. Local Development Execution
```bash
# Headless FastAPI backend
uvicorn main:app --reload --port 8080

# Interactive ADK Web Inspection UI
adk web .

# Next.js Frontend Dashboard
cd frontend
npm run dev
```

---

## 6. Hackathon Status & Roadmap Checklist

- [x] **Core Taskmaster Pipeline (TalentOS // Careers)**: Public ATS & Aggregator ingestion, deterministic pre-filter, ADK Gemini 3.6 Flash evaluation, tailored resume & cover letter generation.
- [x] **Board Scout**: Search-grounded ATS board discovery with public API validation.
- [x] **TalentOS // Studio (Freelance Client Pipeline)**: Public hiring board monitoring (r/forhire, WWR, Contra), fit reasoning, and personalized pitch drafting with deep-link send assistance.
- [x] **Next.js & Firestore Frontend**: Unified landing hub (`agent-launcher.tsx`), dual dashboards (`/jobs` & `/freelance`), tailored resume print preview, inline material and pitch editors with dual-state storage.
- [x] **Cost & Observability**: Token accounting by model tier, thinking token cost tracking, and run-level summaries.
- [x] **Cloud Run & Cloud Scheduler Deployment**: Production deployment on GCP project `allthingsagentic-505213`, running on a 12-hourly schedule.
- [x] **235+ Hermetic Offline Tests**: 100% passing test coverage across all ATS sources, freelance feeds, LangGraph state machines, and FastAPI endpoints.
