"""Aggregator feeds that cover popular job sites (LinkedIn/Indeed/etc.)
without scraping them directly -- see hackathon-project-plan.md guardrails.
"""
from __future__ import annotations

import httpx

from ..models import JobListing
from .text_utils import clean_description

ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api"
REMOTIVE_URL = "https://remotive.com/api/remote-jobs"
REMOTEOK_URL = "https://remoteok.com/api"
JOBICY_URL = "https://jobicy.com/api/v2/remote-jobs?count=50"


async def fetch_arbeitnow(client: httpx.AsyncClient) -> list[JobListing]:
    resp = await client.get(ARBEITNOW_URL, timeout=20)
    resp.raise_for_status()
    data = resp.json().get("data", [])
    out = []
    for j in data:
        out.append(
            JobListing(
                job_id=f"arbeitnow:{j['slug']}",
                source="arbeitnow",
                title=j.get("title", ""),
                company=j.get("company_name", ""),
                location=j.get("location", ""),
                remote=bool(j.get("remote")),
                url=j.get("url", ""),
                description=clean_description(j.get("description", "")),
                posted_at=str(j.get("created_at", "")),
            )
        )
    return out


async def fetch_remotive(client: httpx.AsyncClient) -> list[JobListing]:
    resp = await client.get(REMOTIVE_URL, timeout=25)
    resp.raise_for_status()
    out = []
    for j in resp.json().get("jobs", []):
        out.append(
            JobListing(
                job_id=f"remotive:{j['id']}",
                source="remotive",
                title=j.get("title", ""),
                company=j.get("company_name", ""),
                # Remotive is remote-only, and this field carries the eligibility
                # region ("Worldwide", "USA Only"), which is what actually
                # determines whether the candidate can hold the role.
                location=j.get("candidate_required_location", "") or "Remote",
                remote=True,
                url=j.get("url", ""),
                description=clean_description(j.get("description", "")),
                posted_at=j.get("publication_date"),
            )
        )
    return out


async def fetch_remoteok(client: httpx.AsyncClient) -> list[JobListing]:
    resp = await client.get(REMOTEOK_URL, timeout=25)
    resp.raise_for_status()
    out = []
    for j in resp.json():
        # The feed's first element is a legal/attribution notice, not a job.
        if not isinstance(j, dict) or not j.get("id") or not j.get("position"):
            continue
        out.append(
            JobListing(
                job_id=f"remoteok:{j['id']}",
                source="remoteok",
                title=j.get("position", ""),
                company=j.get("company", ""),
                location=j.get("location") or "Remote",
                remote=True,
                url=j.get("url") or j.get("apply_url", ""),
                description=clean_description(j.get("description", "")),
                posted_at=j.get("date"),
            )
        )
    return out


async def fetch_jobicy(client: httpx.AsyncClient) -> list[JobListing]:
    resp = await client.get(JOBICY_URL, timeout=25)
    resp.raise_for_status()
    out = []
    for j in resp.json().get("jobs", []):
        out.append(
            JobListing(
                job_id=f"jobicy:{j['id']}",
                source="jobicy",
                title=j.get("jobTitle", ""),
                company=j.get("companyName", ""),
                location=j.get("jobGeo", "") or "Remote",
                remote=True,
                url=j.get("url", ""),
                description=clean_description(j.get("jobDescription") or j.get("jobExcerpt", "")),
                posted_at=j.get("pubDate"),
            )
        )
    return out
