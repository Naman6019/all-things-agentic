"""Freelance gig feeds for TalentOS // Studio.

Public hiring boards and freelance marketplaces -- no scraping, no
auto-submission. These are the freelance equivalent of aggregators.py: each
returns a list of ClientLead dataclasses, normalized across sources.

Sources:
  - r/forhire: Reddit's hiring megathread RSS. Public, no auth needed.
  - We Work Remotely (WWR): Contract/freelance category RSS feed.
  - Contra: Public project listing pages (monitor only, no auto-submit).
  - Peerlist: Public hiring feed (optional, disabled by default).

The guardrail is the same as the job pipeline: the agent finds, scores, and
drafts. The human sends the pitch on the platform itself.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET

import httpx

from ..models import ClientLead
from .text_utils import clean_description

RFORHIRE_URL = (
    "https://www.reddit.com/r/forhire/search.rss"
    "?q=flair_name:%22Hiring%22&restrict_sr=1&sort=new&limit=50"
)
WWR_CONTRACT_URL = "https://weworkremotely.com/categories/remote-contract-jobs.rss"
CONTRA_API_URL = "https://contra.com/api/v1/projects?filter=hiring&limit=50"


def _entry_text(entry: ET.Element, tag: str) -> str:
    """Extract text from an RSS element, handling namespaces gracefully."""
    child = entry.find(tag)
    if child is None:
        child = entry.find(f"{{{entry.nsmap.get('', '')}}}{tag}")
    return (child.text or "").strip() if child is not None else ""


def _reddit_id(url: str) -> str:
    """Extract the Reddit post ID from a permalink URL."""
    match = re.search(r"/comments/([a-z0-9]+)", url)
    return match.group(1) if match else url.rsplit("/", 1)[-1]


async def fetch_rforhire(client: httpx.AsyncClient) -> list[ClientLead]:
    """Parse r/forhire 'Hiring' flair posts from the subreddit RSS feed.

    Reddit's RSS is public and requires no authentication. The feed returns
    posts tagged with the 'Hiring' flair, which are companies/individuals
    looking to hire freelancers.
    """
    resp = await client.get(
        RFORHIRE_URL,
        timeout=20,
        headers={"User-Agent": "TalentOS/1.0 (opportunity intelligence)"},
    )
    resp.raise_for_status()
    root = ET.fromstring(resp.text)
    leads: list[ClientLead] = []

    for entry in root.findall(".//item"):
        title = _entry_text(entry, "title")
        link = _entry_text(entry, "link")
        description_raw = _entry_text(entry, "description")
        posted = _entry_text(entry, "pubDate")

        if not title or not link:
            continue

        lead_id = f"rforhire:{_reddit_id(link)}"
        description = clean_description(description_raw)

        # Try to extract budget/timeline from the title or description.
        # r/forhire posts often follow patterns like "[Hiring] React dev, $50/hr, 2 weeks"
        budget = _extract_budget(title + " " + description)
        timeline = _extract_timeline(title + " " + description)

        leads.append(
            ClientLead(
                lead_id=lead_id,
                source="rforhire",
                title=_strip_hiring_prefix(title),
                client="Reddit r/forhire",
                budget=budget,
                timeline=timeline,
                url=link,
                description=description,
                posted_at=posted,
            )
        )

    return leads


async def fetch_wwr_contract(client: httpx.AsyncClient) -> list[ClientLead]:
    """Parse We Work Remotely contract/freelance category RSS feed.

    WWR's RSS is public and keyless. The contract category covers freelance
    and contract positions.
    """
    resp = await client.get(WWR_CONTRACT_URL, timeout=20)
    resp.raise_for_status()
    root = ET.fromstring(resp.text)
    leads: list[ClientLead] = []

    for entry in root.findall(".//item"):
        title = _entry_text(entry, "title")
        link = _entry_text(entry, "link")
        description_raw = _entry_text(entry, "description")
        posted = _entry_text(entry, "pubDate")

        if not title or not link:
            continue

        # WWR titles often include company: "Company Name: Job Title"
        company, clean_title = _split_wwr_title(title)
        lead_id = f"wwr:{link.rsplit('/', 1)[-1]}"

        leads.append(
            ClientLead(
                lead_id=lead_id,
                source="wwr",
                title=clean_title,
                client=company,
                budget=_extract_budget(description_raw),
                timeline=_extract_timeline(description_raw),
                url=link,
                description=clean_description(description_raw),
                posted_at=posted,
            )
        )

    return leads


async def fetch_contra(client: httpx.AsyncClient) -> list[ClientLead]:
    """Fetch Contra's public project/hiring listings.

    Contra exposes public project listings. We monitor only -- the agent never
    submits a proposal through Contra's API. The human opens the link and sends
    the pitch manually.
    """
    try:
        resp = await client.get(CONTRA_API_URL, timeout=20, headers={"Accept": "application/json"})
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError):
        return []

    projects = data if isinstance(data, list) else data.get("projects", data.get("data", []))
    leads: list[ClientLead] = []

    for project in projects:
        if not isinstance(project, dict):
            continue
        pid = str(project.get("id", project.get("slug", "")))
        if not pid:
            continue
        title = str(project.get("title", project.get("name", "")))
        if not title:
            continue

        leads.append(
            ClientLead(
                lead_id=f"contra:{pid}",
                source="contra",
                title=title,
                client=str(project.get("client", project.get("user", project.get("company", "Contra user")))),
                budget=str(project.get("budget", project.get("rate", ""))),
                timeline=str(project.get("timeline", project.get("duration", ""))),
                url=str(project.get("url", project.get("slug", f"https://contra.com/projects/{pid}"))),
                description=clean_description(str(project.get("description", project.get("brief", "")))),
                posted_at=str(project.get("created_at", project.get("posted_at", ""))),
            )
        )

    return leads


# --- Helpers for extracting freelance metadata from unstructured text ---------

_BUDGET_PATTERNS = [
    re.compile(r"\$[\d,]+(?:\s*[-–to]\s*\$?[\d,]+)?(?:\s*/\s*(?:hr|hour|day|week|month))?", re.I),
    re.compile(r"\b\d+\s*[-–to]\s*\d+\s*(?:USD|EUR|GBP|INR)\b", re.I),
    re.compile(r"\b(?:fixed|budget|rate|pay(?:ing)?)\s*[:$]?\s*\$?[\d,]+", re.I),
]

_TIMELINE_PATTERNS = [
    re.compile(r"\b\d+\s*(?:days?|weeks?|months?|hours?)\b", re.I),
    re.compile(r"\b(?:ASAP|immediately|urgent|today|this week)\b", re.I),
]


def _extract_budget(text: str) -> str:
    for pattern in _BUDGET_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(0).strip()
    return ""


def _extract_timeline(text: str) -> str:
    for pattern in _TIMELINE_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(0).strip()
    return ""


def _strip_hiring_prefix(title: str) -> str:
    """Remove '[Hiring]' and similar prefixes from r/forhire titles."""
    return re.sub(r"^\s*\[?\s*(?:Hiring|For Hire)\s*\]?\s*:?\s*", "", title, flags=re.I).strip()


def _split_wwr_title(title: str) -> tuple[str, str]:
    """WWR titles are 'Company: Role'. Split them back."""
    if ": " in title:
        parts = title.split(": ", 1)
        return parts[0], parts[1]
    return "WWR listing", title