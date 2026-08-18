"""Board Scout: discover and validate public ATS job boards.

The model searches; deterministic code decides what is trusted. A candidate is
never added to the shared registry unless its provider and slug are valid and
the provider's public API currently returns at least one posting.
"""
from __future__ import annotations

import asyncio
import json
import re
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

import httpx
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from . import config, matching
from .models import JobListing
from .sources import ats_boards, company_portals
from .storage import firestore_store


SUPPORTED_PROVIDERS = (
    "greenhouse", "lever", "ashby", "smartrecruiters",
    "workable", "workday", "oracle", "successfactors", "icims", "taleo", "feed",
)
_SLUG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$")


class BoardCandidate(BaseModel):
    provider: str
    slug: str
    company: str
    careers_url: str = ""


class BoardCandidateList(BaseModel):
    boards: list[BoardCandidate] = Field(default_factory=list)


def normalize_candidates(candidates: list[BoardCandidate], limit: int) -> list[BoardCandidate]:
    """Allowlisted, de-duplicated candidates only; model output is untrusted."""
    normalized: list[BoardCandidate] = []
    seen: set[tuple[str, str]] = set()
    for candidate in candidates:
        provider = candidate.provider.strip().lower()
        slug = candidate.slug.strip()
        key = (provider, slug.lower())
        portal_url_required = provider in company_portals.PORTAL_PROVIDERS - {"workable"}
        if (
            provider not in SUPPORTED_PROVIDERS
            or not _SLUG_RE.fullmatch(slug)
            or key in seen
            or (portal_url_required and not company_portals.is_safe_public_url(candidate.careers_url.strip()))
        ):
            continue
        seen.add(key)
        normalized.append(
            BoardCandidate(
                provider=provider,
                slug=slug,
                company=candidate.company.strip() or slug,
                careers_url=candidate.careers_url.strip(),
            )
        )
        if len(normalized) >= limit:
            break
    return normalized


def parse_candidate_response(text: str, limit: int) -> list[BoardCandidate]:
    """Extract candidates, retaining complete objects from truncated output."""
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            payload = json.loads(text[start : end + 1])
            parsed = BoardCandidateList.model_validate(payload)
            return normalize_candidates(parsed.boards, limit)
        except (json.JSONDecodeError, ValueError):
            pass

    recovered: list[BoardCandidate] = []
    for match in re.finditer(r'\{[^{}]*"provider"[^{}]*\}', text, flags=re.DOTALL):
        try:
            recovered.append(BoardCandidate.model_validate(json.loads(match.group(0))))
        except (json.JSONDecodeError, ValueError):
            continue
    return normalize_candidates(recovered, limit)


def _configured_board_ids() -> set[str]:
    groups = {
        "greenhouse": config.GREENHOUSE_BOARD_SLUGS,
        "lever": config.LEVER_BOARD_SLUGS,
        "ashby": config.ASHBY_BOARD_SLUGS,
        "smartrecruiters": config.SMARTRECRUITERS_COMPANY_SLUGS,
    }
    configured = {f"{provider}:{slug}".lower() for provider, slugs in groups.items() for slug in slugs}
    configured.update(company_portals.portal_source(portal).lower() for portal in config.COMPANY_CAREER_PORTALS)
    return configured


async def discover_candidates(limit: int) -> tuple[list[BoardCandidate], dict]:
    """Use one Google Search-grounded model call to propose diverse boards."""
    existing = sorted(_configured_board_ids() | set(firestore_store.get_active_board_ids()))
    profile = config.load_candidate_profile()
    target_titles = profile.target_titles[:5]
    location_scope = ", ".join(
        f"{item['location']} ({item['work_mode']})"
        for item in matching.normalized_location_preferences(profile)
    ) or "none configured"
    prompt = f"""
Using current Google Search results, identify public company career-board URLs
that advertise any of these roles:
{', '.join(target_titles)}.

Keep a mix of company sizes, including MNCs. Search public employer career
portals on Greenhouse, Lever, Ashby, SmartRecruiters, and Workable. Also accept
public Workday CXS endpoints and employer-published RSS/Atom feeds, job
sitemaps, JSON feeds, or pages containing schema.org JobPosting data for
Oracle Recruiting, SAP SuccessFactors, iCIMS, and Taleo. For these additional
providers, careers_url must be the exact public machine-readable endpoint,
not a login page or internal/recruiter API. Return at most {limit} boards.
Only propose companies whose current relevant openings match these saved
location preferences: {location_scope}. Do not treat a region-limited remote
posting as worldwide remote.
Do not return LinkedIn, Indeed, Glassdoor, Wellfound, staffing agencies, search
result pages, or these existing boards: {', '.join(existing) or 'none'}.
Return only JSON in this exact shape:
{{"boards":[{{"provider":"ashby","slug":"example","company":"Example","careers_url":"https://jobs.ashbyhq.com/example"}},{{"provider":"feed","slug":"example-careers","company":"Example","careers_url":"https://example.com/jobs.xml"}}]}}
""".strip()

    client = genai.Client(
        vertexai=True,
        project=config.GOOGLE_CLOUD_PROJECT,
        location="global",
        http_options=types.HttpOptions(api_version="v1"),
    )
    try:
        response = await client.aio.models.generate_content(
            model=config.BOARD_SCOUT_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=1.0,
                max_output_tokens=1500,
            ),
        )
    finally:
        await client.aio.aclose()

    metadata = getattr(response.candidates[0], "grounding_metadata", None) if response.candidates else None
    usage = response.usage_metadata
    response_text = response.text or ""
    return parse_candidate_response(response_text, limit), {
        "model": config.BOARD_SCOUT_MODEL,
        "search_queries": list(getattr(metadata, "web_search_queries", None) or []),
        "response_text": response_text[:3000],
        "input_tokens": getattr(usage, "prompt_token_count", 0) or 0,
        "output_tokens": getattr(usage, "candidates_token_count", 0) or 0,
    }


def _fetcher(candidate: BoardCandidate) -> Callable[[str, httpx.AsyncClient], Awaitable[list[JobListing]]]:
    standard = {
        "greenhouse": ats_boards.fetch_greenhouse,
        "lever": ats_boards.fetch_lever,
        "ashby": ats_boards.fetch_ashby,
        "smartrecruiters": ats_boards.fetch_smartrecruiters,
    }
    if candidate.provider in standard:
        return standard[candidate.provider]

    async def fetch_portal(slug: str, client: httpx.AsyncClient) -> list[JobListing]:
        return await company_portals.fetch_portal(
            {
                "provider": candidate.provider,
                "slug": slug,
                "company": candidate.company,
                "url": candidate.careers_url,
                "careers_url": candidate.careers_url,
            },
            client,
            detail_limit=config.COMPANY_PORTAL_MAX_DETAIL_PAGES,
        )

    return fetch_portal


async def validate_candidate(candidate: BoardCandidate, client: httpx.AsyncClient) -> dict:
    """A live public ATS response, not model confidence, admits a board."""
    try:
        jobs = await _fetcher(candidate)(candidate.slug, client)
    except Exception as exc:  # noqa: BLE001 - one bad board must not sink the scout
        return {**candidate.model_dump(), "valid": False, "job_count": 0, "error": f"{type(exc).__name__}: {str(exc)[:160]}"}
    return {**candidate.model_dump(), "valid": bool(jobs), "job_count": len(jobs), "error": ""}


async def run_once(max_candidates: int | None = None) -> dict:
    """Run one bounded discovery pass and update the shared board registry."""
    limit = max(1, min(max_candidates or config.BOARD_SCOUT_MAX_CANDIDATES, 12))
    run_id = f"scout-{uuid.uuid4().hex[:8]}"
    candidates, search = await discover_candidates(limit)
    async with httpx.AsyncClient(
        headers={"User-Agent": "career-agent-board-scout/0.1 (+https://github.com/)"},
        follow_redirects=True,
    ) as client:
        validated = await asyncio.gather(*(validate_candidate(candidate, client) for candidate in candidates))

    added = []
    for board in validated:
        if not board["valid"]:
            continue
        firestore_store.upsert_board_registry(board, run_id=run_id)
        added.append(board)

    result = {
        "run_id": run_id,
        "searched_at": datetime.now(timezone.utc).isoformat(),
        "proposed": len(candidates),
        "validated": len(added),
        "boards": validated,
        "search": search,
    }
    firestore_store.save_board_discovery_run(run_id, result)
    return result


async def reprocess_saved_run(run_id: str, limit: int = 12) -> dict:
    """Re-parse and validate a saved response without another search call."""
    result = firestore_store.get_board_discovery_run(run_id)
    if not result:
        raise ValueError(f"Unknown board discovery run: {run_id}")
    candidates = parse_candidate_response((result.get("search") or {}).get("response_text", ""), limit)
    async with httpx.AsyncClient(
        headers={"User-Agent": "career-agent-board-scout/0.1 (+https://github.com/)"},
        follow_redirects=True,
    ) as client:
        validated = await asyncio.gather(*(validate_candidate(candidate, client) for candidate in candidates))
    for board in validated:
        if board["valid"]:
            firestore_store.upsert_board_registry(board, run_id=run_id)
    result.update(
        proposed=len(candidates),
        validated=sum(1 for board in validated if board["valid"]),
        boards=validated,
        reprocessed_at=datetime.now(timezone.utc).isoformat(),
    )
    firestore_store.save_board_discovery_run(run_id, result)
    return result
