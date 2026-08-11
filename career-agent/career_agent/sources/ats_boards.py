"""Fetchers for mid/large-company career portals via their ATS's public board APIs.

These are free, public, per-company endpoints -- no scraping, no API key.
Add a company by finding its board slug (usually visible in its careers page
URL, e.g. boards.greenhouse.io/<slug> or jobs.lever.co/<slug>) and adding the
slug to GREENHOUSE_BOARD_SLUGS / LEVER_BOARD_SLUGS in your environment.
"""
from __future__ import annotations

import httpx

from ..models import JobListing

GREENHOUSE_URL = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"
LEVER_URL = "https://api.lever.co/v0/postings/{slug}?mode=json"


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
                description=j.get("content", ""),
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
                description=j.get("descriptionPlain") or j.get("description", ""),
                posted_at=None,
            )
        )
    return out


# TODO: Ashby (api.ashbyhq.com/posting-api/job-board/{slug}) and
# SmartRecruiters (api.smartrecruiters.com/v1/companies/{slug}/postings)
# follow the same free/public/no-key pattern -- add fetch_ashby /
# fetch_smartrecruiters here the same way once you have target-company slugs
# for boards on those ATSs.
