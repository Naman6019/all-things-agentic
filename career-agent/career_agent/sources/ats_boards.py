"""Fetchers for mid/large-company career portals via their ATS's public board APIs.

These are free, public, per-company endpoints -- no scraping, no API key.
Add a company by finding its board slug (usually visible in its careers page
URL, e.g. boards.greenhouse.io/<slug> or jobs.lever.co/<slug>) and adding the
slug to GREENHOUSE_BOARD_SLUGS / LEVER_BOARD_SLUGS in your environment.
"""
from __future__ import annotations

import asyncio

import httpx

from ..models import JobListing
from .text_utils import clean_description

GREENHOUSE_URL = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"
LEVER_URL = "https://api.lever.co/v0/postings/{slug}?mode=json"
ASHBY_URL = "https://api.ashbyhq.com/posting-api/job-board/{slug}"
SMARTRECRUITERS_URL = "https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100"
SMARTRECRUITERS_POSTING_URL = "https://api.smartrecruiters.com/v1/companies/{slug}/postings/{posting_id}"


async def fetch_greenhouse(slug: str, client: httpx.AsyncClient) -> list[JobListing]:
    resp = await client.get(GREENHOUSE_URL.format(slug=slug), timeout=20)
    resp.raise_for_status()
    jobs = resp.json().get("jobs", [])
    out = []
    for j in jobs:
        location = (j.get("location") or {}).get("name", "")
        out.append(
            JobListing(
                job_id=f"greenhouse:{slug}:{j['id']}",
                source=f"greenhouse:{slug}",
                title=j.get("title", ""),
                company=slug,
                location=location,
                remote="remote" in location.lower(),
                url=j.get("absolute_url", ""),
                # Greenhouse returns HTML-escaped HTML here.
                description=clean_description(j.get("content", "")),
                posted_at=j.get("updated_at"),
            )
        )
    return out


async def fetch_lever(slug: str, client: httpx.AsyncClient) -> list[JobListing]:
    resp = await client.get(LEVER_URL.format(slug=slug), timeout=20)
    resp.raise_for_status()
    jobs = resp.json()
    out = []
    for j in jobs:
        categories = j.get("categories", {}) or {}
        location = categories.get("location", "") or ""
        out.append(
            JobListing(
                job_id=f"lever:{slug}:{j['id']}",
                source=f"lever:{slug}",
                title=j.get("text", ""),
                company=slug,
                location=location,
                remote="remote" in location.lower(),
                url=j.get("hostedUrl", ""),
                # descriptionPlain is already plain; the `description` fallback is HTML.
                description=clean_description(j.get("descriptionPlain") or j.get("description", "")),
                posted_at=None,
            )
        )
    return out


async def fetch_ashby(slug: str, client: httpx.AsyncClient) -> list[JobListing]:
    """Ashby's public board API. Where most of the AI labs live.

    Returns descriptionPlain alongside descriptionHtml, so no HTML round trip
    is needed for the common case.
    """
    resp = await client.get(ASHBY_URL.format(slug=slug), timeout=20)
    resp.raise_for_status()
    jobs = resp.json().get("jobs", [])
    out = []
    for j in jobs:
        if j.get("isListed") is False:
            continue
        location = j.get("location") or ""
        out.append(
            JobListing(
                job_id=f"ashby:{slug}:{j['id']}",
                source=f"ashby:{slug}",
                title=j.get("title", ""),
                company=slug,
                location=location,
                # isRemote is frequently null, so fall back to the text.
                remote=bool(j.get("isRemote")) or "remote" in str(j.get("workplaceType", "")).lower(),
                url=j.get("jobUrl") or j.get("applyUrl", ""),
                description=clean_description(j.get("descriptionPlain") or j.get("descriptionHtml", "")),
                posted_at=j.get("publishedAt"),
            )
        )
    return out


async def fetch_smartrecruiters(slug: str, client: httpx.AsyncClient) -> list[JobListing]:
    """SmartRecruiters postings list -- WITHOUT descriptions.

    The list endpoint returns no posting body at all; each description needs
    its own request. Fetching them all here would mean one HTTP call per
    posting for boards that run to the hundreds, almost all of which get
    discarded by the title pre-filter moments later. So this returns listings
    with an empty description, and hydrate_descriptions fills in only the
    handful that survive the pre-filter and the per-run cap.
    """
    resp = await client.get(SMARTRECRUITERS_URL.format(slug=slug), timeout=20)
    resp.raise_for_status()
    out = []
    for j in resp.json().get("content", []):
        loc = j.get("location") or {}
        location = ", ".join(p for p in (loc.get("city"), loc.get("region"), loc.get("country")) if p)
        company = (j.get("company") or {}).get("name") or slug
        out.append(
            JobListing(
                job_id=f"smartrecruiters:{slug}:{j['id']}",
                source=f"smartrecruiters:{slug}",
                title=j.get("name", ""),
                company=company,
                location=location,
                remote=bool(loc.get("remote")),
                url=f"https://jobs.smartrecruiters.com/{slug}/{j['id']}",
                description="",  # filled in by hydrate_descriptions
                posted_at=j.get("releasedDate"),
            )
        )
    return out


async def _hydrate_smartrecruiters(job: JobListing, client: httpx.AsyncClient) -> None:
    _, slug, posting_id = job.job_id.split(":", 2)
    resp = await client.get(SMARTRECRUITERS_POSTING_URL.format(slug=slug, posting_id=posting_id), timeout=20)
    resp.raise_for_status()
    payload = resp.json()
    ad = (payload.get("jobAd") or {}).get("sections") or {}
    parts = [
        (ad.get(section) or {}).get("text", "")
        for section in ("companyDescription", "jobDescription", "qualifications", "additionalInformation")
    ]
    job.description = clean_description("\n\n".join(p for p in parts if p))
    # Prefer the employer's own posting page over the URL we assembled from the
    # slug and id: postingUrl points at the company's branded portal where one
    # exists, which is the link a human actually wants to open and apply from.
    job.url = payload.get("postingUrl") or payload.get("applyUrl") or job.url


async def hydrate_descriptions(jobs: list[JobListing], client: httpx.AsyncClient) -> None:
    """Fills in descriptions for sources that don't return them in their listing.

    Called after the pre-filter and per-run cap, so this is bounded by
    MAX_JOBS_PER_RUN rather than by board size. A posting whose body fails to
    load keeps its empty description rather than sinking the run -- the model
    will report it as missing information.
    """
    pending = [j for j in jobs if not j.description and j.source.startswith("smartrecruiters:")]
    if not pending:
        return
    results = await asyncio.gather(
        *(_hydrate_smartrecruiters(j, client) for j in pending), return_exceptions=True
    )
    for job, result in zip(pending, results):
        if isinstance(result, BaseException):
            job.description = "[description could not be retrieved from SmartRecruiters]"
