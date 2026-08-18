# AGENTS.md — TalentOS // Careers Service Guide

> See root [AGENTS.md](../AGENTS.md) for full project architecture, tenets, and track requirements.

---

## 1. Codebase Exploration & Knowledge Graph (Graphify)

- **Codebase Search**: Always use **Graphify** (`graphify`) when searching through the codebase, navigating call graphs, and tracing module dependencies across `career_agent/` modules, FastAPI endpoints, and tests.
- **Graph Updates**: After modifying, adding, or refactoring components or pipelines, update the graph without using LLM tokens:
  ```bash
  graphify update .
  ```
  *(Run from repo root)*
- **Common Exploration Commands**:
  - `graphify query "<question or symbol>"` — BFS traversal for symbols or questions
  - `graphify affected "<symbol>"` — Reverse traversal for blast radius analysis before changes
  - `graphify path "<from>" "<to>"` — Shortest dependency path between two components
  - `graphify explain "<module or class>"` — Context and direct neighbors for a component

---

## 2. Core Python Conventions

1. **The Model is NOT the Control Flow**: Deterministic Python controls ingestion, pre-filtering, rate caps, and persistence. ADK LLM agents are strictly isolated per-job.
2. **Hermetic Offline Testing**: All tests in `tests/` must run offline with no credentials:
   ```bash
   python -m pytest
   ```
3. **Vertex AI Global Endpoint**: Gemini 3.x models require `GOOGLE_CLOUD_LOCATION=global`.
4. **Non-destructive Dual-state Editing**: User edits are stored in `edited_*` fields without overwriting original AI drafts.
