"""Quick-add: hand the agent one specific posting you found yourself.

This is the escape hatch for everything the feeds miss -- a job you saw on
LinkedIn, Indeed, Glassdoor or Wellfound, none of which can be sources (see
the guardrails in ../hackathon-project-plan.md).

Two ways in, and the difference matters:

- **Pasted text** always works and is the primary path. You copy the posting
  body, we evaluate it. Nothing is fetched, so no site's terms are in play.
- **A URL** is only fetched when it points at an ATS board we already read
  through its public, keyless API: Greenhouse, Lever or Ashby. For anything
  else the URL is kept purely as the link to open later, and the posting text
  has to be pasted. We deliberately do not fetch LinkedIn/Indeed/Glassdoor/
  Wellfound pages, because retrieving them automatically is the thing that
  gets accounts banned.
"""
from __future__ import annotations

import hashlib
import re

import httpx

from .models import JobListing
from .sources import ats_boards

# job-boards.greenhouse.io/<slug>/jobs/<id>, boards.greenhouse.io/<slug>/jobs/<id>
_GREENHOUSE_RE = re.compile(r"greenhouse\.io/(?:embed/job_app\?for=)?([\w-]+)/jobs/(\d+)", re.I)
# jobs.lever.co/<slug>/<uuid>
_LEVER_RE = re.compile(r"jobs\.lever\.co/([\w-]+)/([\w-]{8,})", re.I)
# jobs.ashbyhq.com/<slug>/<uuid>
_ASHBY_RE = re.compile(r"jobs\.ashbyhq\.com/([\w-]+)/([\w-]{8,})", re.I)

# Hosts we will never fetch automatically, with the reason surfaced to the user.
BLOCKED_HOSTS = ("linkedin.com", "indeed.com", "glassdoor.", "wellfound.com", "angel.co")


class QuickAddError(ValueError):
    """Raised when a quick-add can't be turned into something evaluable."""


def _stable_id(url: str, text: str) -> str:
    """A content-derived id, so pasting the same posting twice doesn't duplicate it."""
    digest = hashlib.sha256((url or text or "").strip().lower().encode("utf-8")).hexdigest()
    return f"quickadd:{digest[:16]}"


def is_blocked_host(url: str) -> bool:
    return any(host in (url or "").lower() for host in BLOCKED_HOSTS)


async def resolve_url(url: str, client: httpx.AsyncClient) -> JobListing | None:
    """Fetches a posting from an ATS board API, or returns None if not one we read.

    Returns None rather than raising for unknown hosts: the caller falls back
    to requiring pasted text, which is a normal path, not an error.
    """
    if is_blocked_host(url):
        return None

    if (m := _GREENHOUSE_RE.search(url)):
        slug, job_id = m.group(1), m.group(2)
        for job in await ats_boards.fetch_greenhouse(slug, client):
            if job.job_id.endswith(f":{job_id}"):
                return job
        raise QuickAddError(
            f"That Greenhouse posting (id {job_id}) is no longer listed on the {slug} board."
        )

    if (m := _LEVER_RE.search(url)):
        slug, job_id = m.group(1), m.group(2)
        for job in await ats_boards.fetch_lever(slug, client):
            if job.job_id.endswith(f":{job_id}"):
                return job
        raise QuickAddError(f"That Lever posting is no longer listed on the {slug} board.")

    if (m := _ASHBY_RE.search(url)):
        slug, job_id = m.group(1), m.group(2)
        for job in await ats_boards.fetch_ashby(slug, client):
            if job.job_id.endswith(f":{job_id}"):
                return job
        raise QuickAddError(f"That Ashby posting is no longer listed on the {slug} board.")

    return None


def from_text(text: str, url: str = "", title: str = "", company: str = "") -> JobListing:
    """Builds a listing from a pasted posting body.

    Title and company are optional: the model reads them out of the posting
    text when evaluating, and a placeholder title is better than refusing the
    add. But an unknown title means the pre-filter would drop it, which is
    exactly why quick-adds skip the pre-filter entirely.
    """
    text = (text or "").strip()
    if len(text) < 80:
        raise QuickAddError(
            "Paste the posting text (at least a paragraph). "
            "A title alone isn't enough for the agent to evaluate requirements against."
        )
    return JobListing(
        job_id=_stable_id(url, text),
        source="quickadd",
        title=(title or "").strip() or "Pasted posting (title not given)",
        company=(company or "").strip() or "Unknown",
        location="",
        remote=False,
        url=(url or "").strip(),
        description=text,
    )


async def build(url: str = "", text: str = "", title: str = "", company: str = "",
                client: httpx.AsyncClient | None = None) -> JobListing:
    """Turns a quick-add request into a JobListing, preferring pasted text."""
    url, text = (url or "").strip(), (text or "").strip()
    if not url and not text:
        raise QuickAddError("Give a posting URL, the pasted posting text, or both.")

    if text:
        return from_text(text, url=url, title=title, company=company)

    if client is not None:
        resolved = await resolve_url(url, client)
        if resolved is not None:
            return resolved

    if is_blocked_host(url):
        raise QuickAddError(
            "This agent doesn't fetch LinkedIn, Indeed, Glassdoor or Wellfound pages -- "
            "automated retrieval there risks your account. Open the posting, copy its "
            "text, and paste it in; the URL will be kept as the link to apply from."
        )
    raise QuickAddError(
        "That URL isn't a Greenhouse, Lever or Ashby board posting, so it can't be "
        "fetched automatically. Paste the posting text instead -- the URL will still "
        "be saved as the link."
    )
