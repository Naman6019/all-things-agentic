"""Cloud Run entrypoint: exposes /run for Cloud Scheduler to trigger the Job
Search Pipeline, a review UI at /, and /health for uptime checks.

Local dev:
    uvicorn main:app --reload
    curl -X POST localhost:8080/run

Interactive demo instead (drive the per-job evaluator by hand in a browser):
    adk web .

Auth: the service is deployed --no-allow-unauthenticated, so Cloud Run IAM
rejects unauthenticated requests before they reach this process, and Cloud
Scheduler invokes /run with an OIDC token. RUN_AUTH_TOKEN adds a second gate
on the endpoints that spend money, for the case where the service is ever
made public.
"""
from __future__ import annotations

import hmac
import uuid
from urllib.parse import quote

from fastapi import Depends, FastAPI, Form, Header, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from career_agent import config, pipeline, quickadd, webui
from career_agent.storage import firestore_store
from career_agent.tools import job_tools

app = FastAPI()


def require_run_token(x_run_token: str = Header(default="")) -> None:
    """Guards the endpoints that spend money.

    A no-op unless RUN_AUTH_TOKEN is set. Cloud Run IAM is the real gate when
    the service is deployed --no-allow-unauthenticated; this only matters if
    the service is ever made public, where an open /run means strangers
    spending your Vertex budget. Compared with compare_digest so a wrong token
    cannot be recovered a character at a time from response timings.
    """
    if not config.RUN_AUTH_TOKEN:
        return
    if not hmac.compare_digest(x_run_token, config.RUN_AUTH_TOKEN):
        raise HTTPException(status_code=401, detail="Missing or invalid X-Run-Token.")


@app.get("/health")
def health():
    """Liveness probe.

    NOT /healthz: on Cloud Run that path is swallowed by the Google frontend,
    which returns its own 404 without the request ever reaching the container.
    Verified in production -- every other path served normally while /healthz
    404'd both authenticated and not.
    """
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


@app.post("/api/quick-add", dependencies=[Depends(require_run_token)])
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


@app.post("/run", dependencies=[Depends(require_run_token)])
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
