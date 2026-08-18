"""Source fetching and contact lookup for the Job Search Pipeline.

These were ADK tool functions the agent chose to call. They are now plain
functions called by pipeline.py, because the loop they belong to is Python's
job, not the model's -- see agent.py. Their behaviour is unchanged; what went
away is the model deciding when, and how often, each one runs.
"""
from __future__ import annotations

import asyncio
import re
from collections import Counter
from datetime import datetime, timezone

import httpx

from .. import config, matching
from ..models import JobListing
from ..sources import aggregators, ats_boards, company_portals
from ..storage import firestore_store

# RemoteOK and some ATS edges reject the default client user-agent.
_HTTP_HEADERS = {"User-Agent": "career-agent/0.1 (+https://github.com/)"}
_AGGREGATOR_SOURCES = {"arbeitnow", "remotive", "remoteok", "jobicy"}


def _posted_sort_key(job: JobListing) -> float:
    """Normalize ISO and Unix source timestamps; unknown dates sort last."""
    if not job.posted_at:
        return 0
    try:
        value = str(job.posted_at)
        if value.isdigit():
            return datetime.fromtimestamp(int(value), timezone.utc).timestamp()
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError, OverflowError):
        return 0


def balanced_source_batch(jobs: list[JobListing], limit: int) -> list[JobListing]:
    """Selects relevant jobs round-robin so one company/feed cannot dominate."""
    if limit <= 0:
        return []

    by_source: dict[str, list[JobListing]] = {}
    for job in jobs:
        by_source.setdefault(job.source or "unknown", []).append(job)
    for source_jobs in by_source.values():
        source_jobs.sort(key=_posted_sort_key, reverse=True)

    selected: list[JobListing] = []
    positions = {source: 0 for source in by_source}
    while len(selected) < limit:
        progressed = False
        for source, source_jobs in by_source.items():
            position = positions[source]
            if position >= len(source_jobs):
                continue
            selected.append(source_jobs[position])
            positions[source] = position + 1
            progressed = True
            if len(selected) == limit:
                break
        if not progressed:
            break
    return selected


def coverage_balanced_batch(
    jobs: list[JobListing], limit: int, registry_sources: set[str] | None = None
) -> list[JobListing]:
    """Rotate discovered, broad-feed, and configured-company coverage."""
    registry = {source.lower() for source in (registry_sources or set())}
    channels: dict[str, list[JobListing]] = {"discovered": [], "broad_feed": [], "configured": []}
    for job in jobs:
        source = (job.source or "").lower()
        if source in registry:
            channels["discovered"].append(job)
        elif source in _AGGREGATOR_SOURCES:
            channels["broad_feed"].append(job)
        else:
            channels["configured"].append(job)

    channel_batches = {
        name: balanced_source_batch(channel_jobs, len(channel_jobs))
        for name, channel_jobs in channels.items()
    }
    positions = {name: 0 for name in channels}
    selected: list[JobListing] = []
    while len(selected) < limit:
        progressed = False
        for name in ("discovered", "broad_feed", "configured"):
            position = positions[name]
            if position >= len(channel_batches[name]):
                continue
            selected.append(channel_batches[name][position])
            positions[name] += 1
            progressed = True
            if len(selected) == limit:
                break
        if not progressed:
            break
    return selected


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(headers=_HTTP_HEADERS, follow_redirects=True)


async def _fetch_all_sources(
    sources: list[str] | None = None, registry_only: bool = False
) -> tuple[list[JobListing], dict[str, str]]:
    """Fetches every configured source concurrently.

    Returns the combined listings plus a per-source error map. A flaky source
    must not sink the run, but it must not vanish either -- a silently empty
    board looks identical to a board with no matching jobs, which is how you
    end up debugging the wrong thing.
    """
    labelled = []
    errors: dict[str, str] = {}
    configured = {
        "greenhouse": [] if registry_only else list(sources or config.GREENHOUSE_BOARD_SLUGS),
        "lever": [] if registry_only else list(config.LEVER_BOARD_SLUGS),
        "ashby": [] if registry_only else list(config.ASHBY_BOARD_SLUGS),
        "smartrecruiters": [] if registry_only else list(config.SMARTRECRUITERS_COMPANY_SLUGS),
    }
    portal_sources = [] if registry_only else [dict(portal) for portal in config.COMPANY_CAREER_PORTALS]
    try:
        registry = firestore_store.get_active_board_registry()
    except Exception as exc:  # noqa: BLE001 - registry failure must not stop configured sources
        registry = []
        errors["board_registry"] = f"{type(exc).__name__}: {str(exc)[:120]}"
    for board in registry:
        provider = board.get("provider")
        slug = board.get("slug")
        if provider in configured and slug and slug not in configured[provider]:
            configured[provider].append(slug)
        elif provider in company_portals.PORTAL_PROVIDERS and slug:
            portal = {
                "provider": provider,
                "slug": slug,
                "company": board.get("company") or slug,
                "url": board.get("careers_url") or "",
                "careers_url": board.get("careers_url") or "",
            }
            if not any(company_portals.portal_source(item) == company_portals.portal_source(portal) for item in portal_sources):
                portal_sources.append(portal)

    async with _client() as client:
        for slug in configured["greenhouse"]:
            labelled.append((f"greenhouse:{slug}", ats_boards.fetch_greenhouse(slug, client)))
        for slug in configured["lever"]:
            labelled.append((f"lever:{slug}", ats_boards.fetch_lever(slug, client)))
        for slug in configured["ashby"]:
            labelled.append((f"ashby:{slug}", ats_boards.fetch_ashby(slug, client)))
        for slug in configured["smartrecruiters"]:
            labelled.append((f"smartrecruiters:{slug}", ats_boards.fetch_smartrecruiters(slug, client)))
        for portal in portal_sources:
            labelled.append(
                (
                    company_portals.portal_source(portal),
                    company_portals.fetch_portal(
                        portal, client, detail_limit=config.COMPANY_PORTAL_MAX_DETAIL_PAGES
                    ),
                )
            )
        if config.ENABLE_ARBEITNOW and not registry_only:
            labelled.append(("arbeitnow", aggregators.fetch_arbeitnow(client)))
        if config.ENABLE_REMOTIVE and not registry_only:
            labelled.append(("remotive", aggregators.fetch_remotive(client)))
        if config.ENABLE_REMOTEOK and not registry_only:
            labelled.append(("remoteok", aggregators.fetch_remoteok(client)))
        if config.ENABLE_JOBICY and not registry_only:
            labelled.append(("jobicy", aggregators.fetch_jobicy(client)))

        results = await asyncio.gather(*(task for _, task in labelled), return_exceptions=True)

    jobs: list[JobListing] = []
    for (name, _), result in zip(labelled, results):
        if isinstance(result, BaseException):
            errors[name] = f"{type(result).__name__}: {str(result)[:120]}"
            continue
        jobs.extend(result)
    return jobs, errors


async def collect_new_jobs(
    run_id: str,
    evaluator: str = "",
    sources: list[str] | None = None,
    max_jobs: int | None = None,
    registry_only: bool = False,
) -> list[JobListing]:
    """Returns this run's batch of jobs to evaluate, and records how it was chosen.

    `evaluator` identifies the model+profile about to judge these jobs, so
    find_unseen can offer up jobs a *different* evaluator previously skipped.
    """
    # Postings the user added by hand jump the queue and skip the title
    # pre-filter entirely: they chose this job deliberately, so a title-based
    # guess has no business overruling them.
    quick_adds = firestore_store.drain_quick_adds()

    jobs, source_errors = await _fetch_all_sources(sources, registry_only=registry_only)
    unseen = firestore_store.find_unseen(jobs, evaluator=evaluator)

    profile = config.load_candidate_profile()
    relevant, filtered_out = matching.prefilter(unseen, profile)

    # Cap after the pre-filter, so the run's budget goes to plausible jobs
    # rather than whatever the feed listed first. Nothing is marked seen here:
    # dedupe is claimed by pipeline.run_once once a verdict exists, so a run
    # that dies partway leaves its jobs for the next one.
    limit = max(1, min(max_jobs or config.MAX_JOBS_PER_RUN, config.MAX_JOBS_PER_RUN))
    quick_add_batch = quick_adds[:limit]
    feed_capacity = max(0, limit - len(quick_add_batch))
    try:
        registry_sources = set(firestore_store.get_active_board_ids())
    except Exception:  # registry fetch already reports its source error above
        registry_sources = set()
    feed_batch = coverage_balanced_batch(relevant, feed_capacity, registry_sources)
    batch = quick_add_batch + feed_batch

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
            "deferred_to_next_run": max(0, len(relevant) - len(feed_batch)),
            "selected_by_source": dict(Counter(job.source or "unknown" for job in batch)),
            "filtered_out": filtered_out,
            "source_errors": source_errors,
            "evaluator": evaluator,
            "registry_only": registry_only,
        },
    )
    return batch


# Requires the address to end in letters, so a sentence-final full stop is not
# swallowed. The old pattern ended in [\w.-]+ and produced
# "accommodations@scale.com." -- an address that does not exist.
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}")

# Mailboxes that legitimately appear in postings and are NOT hiring contacts.
# Writing to these is worse than sending nothing: an accessibility or privacy
# desk is not going to forward a speculative application, and it wastes the
# one impression the candidate gets. A real posting produced
# "accommodations@scale.com", which the old code reported as high confidence.
_NON_HIRING_MAILBOXES = (
    "accommodation", "accessibility", "ada", "privacy", "legal", "compliance",
    "dpo", "gdpr", "security", "abuse", "noreply", "no-reply", "donotreply",
    "unsubscribe", "webmaster", "postmaster", "press", "media", "marketing",
    "sales", "billing", "invoice", "support", "help", "helpdesk",
)

# Local parts that indicate an actual hiring channel.
_HIRING_MAILBOXES = (
    "career", "job", "recruit", "talent", "hiring", "hire", "apply",
    "application", "resume", "cv", "hr", "people", "staffing", "work",
)


def _classify_contact(email: str) -> str | None:
    """Returns a confidence for an address found in posting text, or None to reject.

    Three outcomes rather than two, because "some address appears in the text"
    and "this is where applications go" are different claims and the candidate
    acts on them differently.
    """
    local = email.split("@", 1)[0].lower()
    if any(bad in local for bad in _NON_HIRING_MAILBOXES):
        return None
    if any(good in local for good in _HIRING_MAILBOXES):
        return "high"
    # A named or generic address that is not obviously either -- plausible, but
    # the candidate should look before writing to it.
    return "medium"


async def find_hiring_contact(company: str, job_description: str, job_url: str) -> dict:
    """Looks for a publicly available hiring contact, for a job already matched.

    Scans every address in the posting rather than taking the first, because
    postings routinely list an accessibility or privacy mailbox before the
    hiring one. Rejected mailboxes are skipped entirely; a hiring-looking
    address wins over a merely plausible one.
    """
    best: tuple[str, str] | None = None
    for email in _EMAIL_RE.findall(job_description or ""):
        confidence = _classify_contact(email)
        if confidence is None:
            continue
        if confidence == "high":
            best = (email, confidence)
            break
        if best is None:
            best = (email, confidence)
    if best:
        return {"email": best[0], "source": "job_posting_text", "confidence": best[1]}

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
