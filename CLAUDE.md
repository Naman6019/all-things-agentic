# CLAUDE.md — Claude Code & Multi-Assistant Collaboration Guide

This repository is configured for interoperability across **Claude Code**, **OpenAI Codex**, and **Google Antigravity**.

---

## 1. Quick Commands

### Python Backend & Agent Workflows (`career-agent/`)
```bash
cd career-agent

# Run full hermetic test suite (offline)
python -m pytest

# Run specific test modules
python -m pytest tests/test_langgraph_pipeline.py tests/test_telemetry.py

# Start local FastAPI backend (port 8080)
uvicorn main:app --reload --port 8080

# Trigger a test run
curl -X POST http://localhost:8080/run

# Interactive Google ADK Web inspection UI
adk web .
```

### Next.js 15 Frontend Dashboard (`career-agent/frontend/`)
```bash
cd career-agent/frontend
npm run dev
npm run build
npm run lint
```

---

## 2. Architectural Structure

* **State Graph & Workflow Orchestration**: Powered by **LangGraph** (`career_agent/graph.py`), defining state transitions between Ingestion, Deterministic Pre-filtering, Evaluator Agent, Drafter Agent, Contact Discovery, and Digest Dispatching.
* **Observability & Tracing**: Powered by **Langfuse** (`career_agent/telemetry.py`), tracking trace roots, generation spans, token counts, thinking tokens, latencies, and match strength scores with graceful offline fallback.
* **Agent Reasoning**: Powered by **Google ADK** (`google.adk`) with **Gemini 3.6 Flash** / **Gemini 3.5 Flash** on Vertex AI (`GOOGLE_CLOUD_LOCATION=global`).
* **Storage & Memory**: Google Cloud **Firestore** in Native mode (`us-central1`).
* **Frontend**: Next.js 15 App Router with Tailwind CSS on Firebase App Hosting.

---

## 3. Core Coding Tenets

1. **The Model is NOT the Control Flow**: Ingestion, pre-filtering, dedupe, and persistence are deterministic Python code; the model is only invoked for qualitative fit evaluation and drafting tailored materials.
2. **Hermetic Offline Testing**: Tests in `tests/` must never require live external API keys or live network requests.
3. **No Direct Bot Submissions**: Keep the human-in-the-loop for final application sending.
4. **Vertex AI Global Endpoint**: Always use `GOOGLE_CLOUD_LOCATION=global` for Gemini 3.x models.
