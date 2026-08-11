"""Aggregator feeds that cover popular job sites (LinkedIn/Indeed/etc.)
without scraping them directly -- see hackathon-project-plan.md guardrails.
"""
from __future__ import annotations

import httpx

from ..models import JobListing

ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api"


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
                description=j.get("description", ""),
                posted_at=str(j.get("created_at", "")),
            )
        )
    return out


# TODO: Remotive (remotive.com/api/remote-jobs) and RemoteOK
# (remoteok.com/api) expose similarly free JSON feeds -- add fetch_remotive /
# fetch_remoteok here following the same pattern for broader coverage.
