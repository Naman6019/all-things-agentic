"""ADK tool functions for the Job Search Pipeline.

Each function here becomes a callable "tool" the LlmAgent can invoke -- ADK
builds each tool's schema from the type hints and docstring, so keep both
accurate; the model reads them to decide when and how to call each one.

Concurrency note: current_run_id is a contextvar, set once per pipeline run
in main.py's /run handler. asyncio contextvars propagate into tasks spawned
from that request's context, which is what makes this safe across concurrent
Cloud Run requests -- but it hasn't been load-tested, so if you see run_ids
bleeding across concurrent runs, that's the first place to look.
"""
from __future__ import annotations

import asyncio
import contextvars
import re
from dataclasses import asdict

import httpx

from .. import config, matching
from ..models import JobEvaluation, TailoredMaterials
from ..sources import aggregators, ats_boards
from ..storage import firestore_store

current_run_id: contextvars.ContextVar[str] = contextvars.ContextVar("current_run_id", default="local")


# RemoteOK and some ATS edges reject the default client user-agent.
_HTTP_HEADERS = {"User-Agent": "career-agent/0.1 (+https://github.com/)"}


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(headers=_HTTP_HEADERS, follow_redirects=True)


async def _fetch_all_sources(sources: list[str] | None) -> tuple[list, dict[str, str]]:
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

    jobs = []
    errors: dict[str, str] = {}
    for (name, _), result in zip(labelled, results):
        if isinstance(result, BaseException):
            errors[name] = f"{type(result).__name__}: {str(result)[:120]}"
            continue
        jobs.extend(result)
    return jobs, errors


async def fetch_new_jobs(sources: list[str] | None = None) -> list[dict]:
    """Fetches job listings from configured career portals and job-site aggregators, and returns only the ones not seen in a previous run.

    Args:
        sources: Optional list of Greenhouse board slugs to check instead of
            the default configured list. Leave empty to use the configured
            mid/large-company boards plus aggregator feeds.

    Returns:
        A list of job dicts, each with job_id, title, company, location,
        remote, url, and description. These have already been screened for
        title relevance, so evaluate every job returned here.
    """
    # Postings the user added by hand jump the queue and skip the title
    # pre-filter entirely: they chose this job deliberately, so a title-based
    # guess has no business overruling them.
    quick_adds = firestore_store.drain_quick_adds()

    jobs, source_errors = await _fetch_all_sources(sources)
    unseen = firestore_store.find_unseen(jobs)

    profile = config.load_candidate_profile()
    relevant, filtered_out = matching.prefilter(unseen, profile)

    # Cap after the pre-filter, so the run's budget is spent on plausible jobs
    # rather than on whatever the feed happened to list first. Cap before
    # marking seen, so anything past it stays unseen for a later run.
    batch = (quick_adds + relevant)[: config.MAX_JOBS_PER_RUN]

    # Only now are descriptions worth paying for -- see fetch_smartrecruiters.
    async with _client() as client:
        await ats_boards.hydrate_descriptions(batch, client)

    # Deliberately NOT marked seen here. Dedupe is claimed by
    # record_job_evaluation once a verdict exists, so a run that dies partway
    # leaves its unevaluated jobs available to the next one.
    for job in batch:
        firestore_store.save_job_listing(job)

    # Pre-filtered jobs are deliberately NOT marked seen. They cost nothing to
    # re-screen (no model call), and leaving them unseen means widening
    # target_titles later surfaces jobs that were skipped under the old list
    # rather than burying them forever.
    firestore_store.save_run_summary(
        current_run_id.get(),
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
    return [asdict(j) for j in batch]


def get_candidate_profile() -> dict:
    """Returns the candidate's job-search profile: target titles, hard requirements, and resume/writing context to use when evaluating and tailoring applications."""
    profile = config.load_candidate_profile()
    return asdict(profile)


def record_job_evaluation(
    job_id: str,
    match: bool,
    unmet_requirements: list[str],
    missing_information: list[str],
    reasoning: str,
) -> str:
    """Records your match verdict for a job against the candidate's profile. Call this exactly once per job returned by fetch_new_jobs, whether or not it matches.

    Args:
        job_id: The job_id from fetch_new_jobs.
        match: True if the posting does not rule the candidate out on any requirement it actually states. A requirement the posting is silent about does NOT make this False.
        unmet_requirements: Requirements the posting states and the candidate demonstrably fails, in specific human-readable terms (e.g. "Requires 8+ yrs experience, profile has 1"). Empty list if match is True.
        missing_information: Requirements the posting never states, so you could not check them (e.g. "Posting does not state a salary range", "Posting does not say whether visa sponsorship is available"). These are things for the candidate to verify, not reasons to reject.
        reasoning: A one to two sentence explanation of the verdict.

    Returns:
        A confirmation string.
    """
    evaluation = JobEvaluation(
        job_id=job_id,
        match=match,
        unmet_requirements=unmet_requirements,
        missing_information=missing_information,
        reasoning=reasoning,
    )
    firestore_store.save_evaluation(current_run_id.get(), evaluation)
    # Claim dedupe only now that a verdict is durably stored -- see
    # firestore_store.mark_job_seen for why this is not done at fetch time.
    firestore_store.mark_job_seen(job_id)
    return f"Recorded evaluation for {job_id}: match={match}"


def find_hiring_contact(company: str, job_description: str, job_url: str) -> dict:
    """Looks up a publicly available hiring contact for a company, for a job you've already marked as a match. Tries publicly published info first, then an email-finder API if one is configured.

    Args:
        company: The company name or board slug.
        job_description: The full job posting text (may contain a named contact or application email).
        job_url: The posting URL, for reference/logging only.

    Returns:
        A dict with 'email' (str or None), 'source' (str describing where it came from), and 'confidence' ('high'/'low'/'none').
    """
    email_match = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", job_description or "")
    if email_match:
        return {"email": email_match.group(0), "source": "job_posting_text", "confidence": "high"}

    if config.HUNTER_API_KEY:
        try:
            resp = httpx.get(
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


def save_tailored_materials(
    job_id: str,
    tailored_resume_summary: str,
    cover_letter: str,
    contact_email: str | None = None,
    contact_source: str | None = None,
) -> str:
    """Saves the resume tailoring and cover letter you drafted for a matched job, ready for the candidate's one-click review and send. Call this once per job where record_job_evaluation reported match=True.

    Args:
        job_id: The job_id this draft is for.
        tailored_resume_summary: 3-5 bullet points rewriting the candidate's most relevant real experience for this specific job, in the candidate's own resume language -- not a full resume rewrite, and never fabricated experience.
        cover_letter: A short (150-250 word) cover letter draft tailored to this posting.
        contact_email: The hiring contact email, if find_hiring_contact returned one.
        contact_source: Where that contact came from (job_posting_text / hunter.io / pattern_guess).

    Returns:
        A confirmation string.
    """
    materials = TailoredMaterials(
        job_id=job_id,
        tailored_resume_summary=tailored_resume_summary,
        cover_letter=cover_letter,
        contact_email=contact_email,
        contact_source=contact_source,
    )
    firestore_store.save_materials(materials)
    return f"Saved tailored materials for {job_id}"


def send_digest() -> str:
    """Sends the candidate a single digest email summarizing this run: every matched job with its tailored materials ready for one-click review, and every skipped job with the specific unmet requirement. Call this exactly once, after every job from fetch_new_jobs has been evaluated.

    Returns:
        A confirmation string.
    """
    from . import notify  # local import so notify's email deps aren't required unless this runs

    apps = firestore_store.get_run_applications(current_run_id.get())
    matched = [a for a in apps if a.get("status") in ("matched", "drafted")]
    skipped = [a for a in apps if a.get("status") == "skipped"]
    summary = firestore_store.get_run_summary(current_run_id.get())
    notify.send_digest_email(
        matched=matched, skipped=skipped, run_id=current_run_id.get(), summary=summary
    )
    return f"Digest sent for run {current_run_id.get()}: {len(matched)} matched, {len(skipped)} skipped"
