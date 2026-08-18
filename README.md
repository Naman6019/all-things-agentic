# TalentOS

An **AllStackLabs** product. Hackathon submission for the **Taskmaster** track: an autonomous opportunity intelligence platform featuring a dual-stream agent pipeline that discovers opportunities across public ATS and freelance feeds, checks each against hard/soft requirements via per-lead reasoning, and generates tailored, high-converting materials — all ending in concrete artifacts rather than chat replies.

---

## What's here

| Directory / File | Description |
|---|---|
| [`career-agent/`](career-agent/) | The core service. **Start with its [README](career-agent/README.md)** for setup, running, architecture, and caveats. |
| [`hackathon-project-plan.md`](hackathon-project-plan.md) | Design rationale, anti-automation guardrails, and track rubrics. |
| [`AGENTS.md`](AGENTS.md) | Architectural tenets, repo map, schemas, and developer guide for human and AI contributors. |

---

## Architecture: Dual-Stream Autonomous Opportunity Pipeline

```mermaid
flowchart TB
    SCHED["Cloud Scheduler<br/>(12h cron cadence)"]

    subgraph SOURCES_CAREERS["Careers Ingestion — Public ATS & Aggregators"]
        ATS["ATS Boards<br/>Greenhouse · Lever · Ashby · SmartRecruiters · Workable"]
        AGG["Aggregators<br/>Arbeitnow · Remotive · RemoteOK · Jobicy"]
    end

    subgraph SOURCES_STUDIO["Studio Ingestion — Freelance & Gig Feeds"]
        REDDIT["r/forhire RSS"]
        WWR["We Work Remotely Contracts"]
        CONTRA["Contra & Peerlist Feeds"]
    end

    subgraph CLOUD_RUN["TalentOS Engine — Cloud Run (FastAPI + LangGraph)"]
        subgraph PIPELINE_CAREERS["TalentOS // Careers StateGraph"]
            FETCH_C["1 · Ingest & Dedupe"]
            FILTER_C["2 · Deterministic Pre-filter<br/>(Title, Seniority, Location)"]
            EVAL_C["3 · Evaluator Agent<br/>(3-State Reasoning)"]
            DRAFT_C["4 · Drafter Agent<br/>(Tailored Resume + Cover Letter)"]
        end

        subgraph PIPELINE_STUDIO["TalentOS // Studio StateGraph"]
            FETCH_S["1 · Ingest & Dedupe"]
            FILTER_S["2 · Pre-filter & Sanitize<br/>(Length & Budget)"]
            EVAL_S["3 · Freelance Evaluator<br/>(Scope & Tech Stack Fit)"]
            DRAFT_S["4 · Pitcher Agent<br/>(Targeted 3-Paragraph Pitch)"]
        end
    end

    VERTEX["Vertex AI · Gemini 3.6 Flash / 3.5 Flash<br/>(Structured Pydantic Outputs)"]
    SM["Secret Manager<br/>(Master Candidate Profile)"]
    FS[("Firestore (Native Mode)<br/>jobs · applications · leads · pitches · runs")]

    subgraph FRONTEND["TalentOS Unified Dashboard (Next.js 15 App Router)"]
        LAUNCHER["Landing Hub (/)"]
        CAREERS_UI["Careers Dashboard (/jobs)<br/>Printable Resumes · Cover Letters · Grouped Cards"]
        STUDIO_UI["Studio Dashboard (/freelance)<br/>Live Lead Feed · Pitch Editor · Deep-Link Dispatch"]
    end

    HUMAN(["Human-in-the-Loop<br/>Reviews draft, copies pitch / clicks apply"])

    SCHED -->|OIDC POST /run| FETCH_C
    SCHED -->|OIDC POST /run-freelance| FETCH_S

    SOURCES_CAREERS --> FETCH_C
    SOURCES_STUDIO --> FETCH_S

    FETCH_C --> FILTER_C --> EVAL_C --> DRAFT_C
    FETCH_S --> FILTER_S --> EVAL_S --> DRAFT_S

    EVAL_C <--> VERTEX
    DRAFT_C <--> VERTEX
    EVAL_S <--> VERTEX
    DRAFT_S <--> VERTEX

    SM -. mounted profile .-> EVAL_C
    SM -. mounted profile .-> EVAL_S

    DRAFT_C --> FS
    DRAFT_S --> FS

    FS <--> FRONTEND
    LAUNCHER --> CAREERS_UI
    LAUNCHER --> STUDIO_UI
    CAREERS_UI --> HUMAN
    STUDIO_UI --> HUMAN
```

---

## Core Architectural Tenets

1. **The Model is NOT the Control Flow**: Ingestion, deduplication, deterministic pre-filtering, rate caps, and persistence are executed in standard Python (via LangGraph state graphs). The LLM is invoked only for qualitative judgment.
2. **Cheap Filters Before Expensive Evaluation**: Roughly ~91% of irrelevant listings are dropped deterministically before any Vertex AI invocation, with every dropped item accounted for by reason.
3. **Strict 3-State Qualification Logic**: Requirements are categorized as **MET**, **UNMET**, or **NOT STATED**. Silence in a job description is never treated as a rejection.
4. **Hard Anti-Automation & Platform Guardrails**: Direct bot submission to protected platforms is strictly forbidden. The system prepares reviewable artifacts; the final apply/send action is strictly reserved for the human.

---

## The Dual Pipelines

### 1. TalentOS // Careers (Full-Time Opportunity Pipeline)
* **Ingestion**: 4 public ATS platforms (Greenhouse, Lever, Ashby, SmartRecruiters) + direct company portals + 4 open aggregator feeds (~2,500 postings/run).
* **Board Scout**: Search-grounded ATS board discovery using Google GenAI Search Grounding with strict API validation.
* **Output Artifacts**: Print-ready tailored HTML resumes, targeted cover letters, email digests, and grouped review cards.

### 2. TalentOS // Studio (Freelance Client Pipeline)
* **Ingestion**: `r/forhire` RSS, We Work Remotely contracts, and Contra/Peerlist open feeds.
* **Fit Scoring**: Evaluates client pain points against freelancer service offerings, verified portfolio projects, and availability.
* **Output Artifacts**: Tailored 3-paragraph problem-solving client pitches with suggested rates and one-click deep-link send assistance.

---

## Tech Stack & Google Cloud Ecosystem

* **Agent Framework**: Google ADK (`google.adk`) with isolated per-job `InMemorySessionService`.
* **State Machine & Orchestration**: LangGraph (`langgraph`).
* **Foundation Models**: Gemini 3.6 Flash & Gemini 3.5 Flash served via Vertex AI (`GOOGLE_CLOUD_LOCATION=global`).
* **Observability & Tracing**: Langfuse v2 with zero-overhead offline fallback.
* **Database & Memory**: Google Cloud Firestore (Native Mode, multi-tenant collections).
* **Compute & Scheduling**: Google Cloud Run (private OIDC service) + Google Cloud Scheduler (12h cadence).
* **Frontend**: Next.js 15 App Router, React 19, Tailwind CSS on Firebase App Hosting.

---

## Local Development & Testing

```bash
# 1. Run the hermetic offline test suite (235+ tests, ~6s)
cd career-agent
python -m pytest

# 2. Start the FastAPI backend
uvicorn main:app --reload --port 8080

# 3. Start the Next.js frontend dashboard
cd frontend
npm run dev
```
