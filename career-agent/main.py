"""Cloud Run entrypoint: exposes /run for Cloud Scheduler to trigger the Job
Search Pipeline, and /healthz for Cloud Run's own health checks.

Local dev:
    uvicorn main:app --reload
    curl -X POST localhost:8080/run

Interactive demo instead (watch the agent call tools live in a browser):
    adk web .

Production note: this endpoint has no auth on it yet. Before deploying for
real, put it behind Cloud Scheduler's OIDC token + a check here (or make the
Cloud Run service require authentication and grant the Scheduler service
account the Cloud Run Invoker role), so /run can't be triggered by anyone
who finds the URL.
"""
from __future__ import annotations

import uuid

from fastapi import FastAPI
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from career_agent.agent import root_agent
from career_agent.tools import job_tools

APP_NAME = "career-agent"

app = FastAPI()


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.post("/run")
async def run_pipeline():
    """Runs one full pass of the Job Search Pipeline.

    This is a single, self-contained agent invocation -- no multi-turn
    conversation state needed, since each scheduled run starts fresh and
    Firestore (not agent session state) is what makes the pipeline
    idempotent across runs. InMemorySessionService is enough here; a
    Firestore-backed SessionService would only matter if this became a
    multi-turn conversational agent (like the Wireframe Assistant).
    """
    run_id = uuid.uuid4().hex[:8]
    job_tools.current_run_id.set(run_id)

    session_service = InMemorySessionService()
    user_id = "career-agent-scheduler"
    session_id = f"run-{run_id}"
    await session_service.create_session(app_name=APP_NAME, user_id=user_id, session_id=session_id)

    runner = Runner(agent=root_agent, app_name=APP_NAME, session_service=session_service)
    message = types.Content(role="user", parts=[types.Part(text="Run the job search pipeline.")])

    event_count = 0
    async for _event in runner.run_async(user_id=user_id, session_id=session_id, new_message=message):
        event_count += 1

    return {"run_id": run_id, "event_count": event_count}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
