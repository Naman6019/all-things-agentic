"""Cloud Run entrypoint: exposes /run for Cloud Scheduler to trigger the Job
Search Pipeline, and /healthz for Cloud Run's own health checks.

Local dev:
    uvicorn main:app --reload
    curl -X POST localhost:8080/run

Interactive demo instead (drive the per-job evaluator by hand in a browser):
    adk web .

Production note: this endpoint has no auth on it yet. Before deploying for
real, put it behind Cloud Scheduler's OIDC token + a check here (or make the
Cloud Run service require authentication and grant the Scheduler service
account the Cloud Run Invoker role), so /run can't be triggered by anyone
who finds the URL.
"""
from __future__ import annotations

import uuid
from urllib.parse import quote

from fastapi import FastAPI, Form, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from career_agent import pipeline, quickadd, webui
from career_agent.storage import firestore_store
from career_agent.tools import job_tools

app = FastAPI()


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def review_ui(status: str = "matched", queued: int = 0, error: str = ""):
    """Read-only review page: matched jobs, their JD links, and why they matched.

    Read-only on purpose. The guardrail this project is built around is that a
    human performs the actual apply/send, so this page links out to the posting
    rather than submitting anything.
    """
    return webui.render(status, queued=bool(queued), error=error)


@app.get("/api/jobs")
def api_jobs(status: str = "matched"):
    """The same data as JSON, for anything that wants to consume it directly."""
    statuses = ["matched", "drafted"] if status == "matched" else [status]
    return {"status": status, "jobs": firestore_store.get_applications_by_status(statuses)}


class QuickAddRequest(BaseModel):
    url: str = ""
    text: str = ""
    title: str = ""
    company: str = ""


async def _queue_quick_add(url: str, text: str, title: str, company: str) -> str:
    async with job_tools._client() as client:
        job = await quickadd.build(url=url, text=text, title=title, company=company, client=client)
    firestore_store.enqueue_quick_add(job)
    return job.job_id


@app.post("/api/quick-add")
async def api_quick_add(payload: QuickAddRequest):
    """Queues one user-supplied posting for the next run.

    Paste the posting text for anything on LinkedIn/Indeed/Glassdoor/Wellfound;
    a Greenhouse, Lever or Ashby URL is resolved through its public API. See
    career_agent/quickadd.py for why the distinction exists.
    """
    try:
        job_id = await _queue_quick_add(payload.url, payload.text, payload.title, payload.company)
    except quickadd.QuickAddError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"queued": job_id, "note": "Evaluated on the next POST /run."}


@app.post("/quick-add")
async def quick_add_form(
    url: str = Form(""),
    text: str = Form(""),
    title: str = Form(""),
    company: str = Form(""),
):
    """Form target for the review UI's paste box; redirects back to the page."""
    try:
        await _queue_quick_add(url, text, title, company)
    except quickadd.QuickAddError as e:
        return RedirectResponse(f"/?status=matched&error={quote(str(e))}", status_code=303)
    return RedirectResponse("/?status=matched&queued=1", status_code=303)


@app.post("/run")
async def run_pipeline_endpoint():
    """Runs one full pass of the Job Search Pipeline.

    The control flow lives in career_agent/pipeline.py as ordinary Python; the
    model is called once per job to judge it and once more per match to draft
    materials. Firestore, not session state, is what makes runs idempotent, so
    nothing here needs to persist between requests.
    """
    return await pipeline.run_once(uuid.uuid4().hex[:8])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
