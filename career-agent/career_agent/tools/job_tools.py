"""Source fetching and contact lookup for the Job Search Pipeline.

These were ADK tool functions the agent chose to call. They are now plain
functions called by pipeline.py, because the loop they belong to is Python's
job, not the model's -- see agent.py. Their behaviour is unchanged; what went
away is the model deciding when, and how often, each one runs.
"""
from __future__ import annotations

import asyncio
import re

import httpx

from .. import config, matching
from ..models import JobListing
from ..sources import aggregators, ats_boards
from ..storage import firestore_store

# RemoteOK and some ATS edges reject the default client user-agent.
_HTTP_HEADERS = {"User-Agent": "career-agent/0.1 (+https://github.com/)"}


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(headers=_HTTP_HEADERS, follow_redirects=True)


async def _fetch_all_sources(sources: list[str] | None = None) -> tuple[list[JobListing], dict[str, str]]:
    """Fetches every configured source concurrently.

    Returns the combined listings plus a per-source error map. A flaky source
    must not sink the run, but it must not vanish either -- a silently empty
    board looks identical to a board with no matching jobs, which is how you
    end up debugging the wrong thing.
    """
    labelled = []
    async with _client() as client:
        for slug in (sources or config.GREENHOUSE_BOARD_SLUGS):
            labelled.append((f"greenhouse:{slug}", ats_boards.fetch_greenhouse(slug, client)))
        for slug in config.LEVER_BOARD_SLUGS:
            labelled.append((f"lever:{slug}", ats_boards.fetch_lever(slug, client)))
        for slug in config.ASHBY_BOARD_SLUGS:
            labelled.append((f"ashby:{slug}", ats_boards.fetch_ashby(slug, client)))
        for slug in config.SMARTRECRUITERS_COMPANY_SLUGS:
            labelled.append((f"smartrecruiters:{slug}", ats_boards.fetch_smartrecruiters(slug, client)))
        if config.ENABLE_ARBEITNOW:
            labelled.append(("arbeitnow", aggregators.fetch_arbeitnow(client)))
        if config.ENABLE_REMOTIVE:
            labelled.append(("remotive", aggregators.fetch_remotive(client)))
        if config.ENABLE_REMOTEOK:
            labelled.append(("remoteok", aggregators.fetch_remoteok(client)))
        if config.ENABLE_JOBICY:
            labelled.append(("jobicy", aggregators.fetch_jobicy(client)))

        results = await asyncio.gather(*(task for _, task in labelled), return_exceptions=True)

    jobs: list[JobListing] = []
    errors: dict[str, str] = {}
    for (name, _), result in zip(labelled, results):
        if isinstance(result, BaseException):
            errors[name] = f"{type(result).__name__}: {str(result)[:120]}"
            continue
        jobs.extend(result)
    return jobs, errors


async def collect_new_jobs(run_id: str, sources: list[str] | None = None) -> list[JobListing]:
    """Returns this run's batch of jobs to evaluate, and records how it was chosen."""
    # Postings the user added by hand jump the queue and skip the title
    # pre-filter entirely: they chose this job deliberately, so a title-based
    # guess has no business overruling them.
    quick_adds = firestore_store.drain_quick_adds()

    jobs, source_errors = await _fetch_all_sources(sources)
    unseen = firestore_store.find_unseen(jobs)

    profile = config.load_candidate_profile()
    relevant, filtered_out = matching.prefilter(unseen, profile)

    # Cap after the pre-filter, so the run's budget goes to plausible jobs
    # rather than whatever the feed listed first. Nothing is marked seen here:
    # dedupe is claimed by pipeline.run_once once a verdict exists, so a run
    # that dies partway leaves its jobs for the next one.
    batch = (quick_adds + relevant)[: config.MAX_JOBS_PER_RUN]

    # Only now are descriptions worth paying for -- see fetch_smartrecruiters.
    async with _client() as client:
        await ats_boards.hydrate_descriptions(batch, client)

    for job in batch:
        firestore_store.save_job_listing(job)

    firestore_store.save_run_summary(
        run_id,
        {
            "fetched": len(jobs),
            "quick_added": len(quick_adds),
            "unseen": len(unseen),
            "relevant_after_prefilter": len(relevant),
            "taken_this_run": len(batch),
            "deferred_to_next_run": max(0, len(relevant) - len(batch)),
            "filtered_out": filtered_out,
            "source_errors": source_errors,
        },
    )
    return batch


async def find_hiring_contact(company: str, job_description: str, job_url: str) -> dict:
    """Looks for a publicly available hiring contact, for a job already matched.

    Conservative on purpose: an address found in the posting text or returned by
    Hunter is reported as high confidence, and a constructed careers@ address is
    clearly labelled a guess so it is checked before anyone writes to it.
    """
    email_match = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", job_description or "")
    if email_match:
        return {"email": email_match.group(0), "source": "job_posting_text", "confidence": "high"}

    if config.HUNTER_API_KEY:
        try:
            async with _client() as client:
                resp = await client.get(
                    "https://api.hunter.io/v2/domain-search",
                    params={"company": company, "api_key": config.HUNTER_API_KEY, "limit": 1},
                    timeout=15,
                )
                resp.raise_for_status()
                emails = resp.json().get("data", {}).get("emails", [])
                if emails:
                    return {"email": emails[0]["value"], "source": "hunter.io", "confidence": "high"}
        except httpx.HTTPError:
            pass  # fall through to the low-confidence guess below

    guess = f"careers@{company.lower().replace(' ', '')}.com"
    return {"email": guess, "source": "pattern_guess", "confidence": "low"}
