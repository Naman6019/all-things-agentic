"""Deterministic pre-filter that runs before any model call.

Why this exists: the per-run cap (config.MAX_JOBS_PER_RUN) takes the first N
unseen jobs in feed order, and feed order has nothing to do with relevance. A
smoke run against the `discord` board spent its entire budget of 5 on an
Account Manager, a Product Counsel and three Engineering Manager postings for a
backend/ML profile. Ranking cheaply here means the model's budget is spent on
plausible jobs instead.

This deliberately does NOT decide matches. It answers only "is this worth
spending a model call on"; the actual verdict, with its reasons and its
unknown-vs-unmet handling, stays with the agent.

The trade-off it introduces: anything dropped here never gets an individual,
model-written reason, which cuts against the project's "every non-match gets a
reason, not a silent drop" rule. So the filter returns counts by reason, which
are persisted per run and surfaced in the digest -- you always see how many
postings were set aside and why, even though 800 of them don't each get a
paragraph.
"""
from __future__ import annotations

import re

from .models import CandidateProfile, JobListing

# Keep '+' and '#' so "c++" and "c#" survive tokenization.
_TOKEN_RE = re.compile(r"[a-z0-9+#]+")

REASON_TITLE = "title_not_in_target_titles"
REASON_NOT_REMOTE = "remote_only_but_posting_is_onsite"


def _tokens(text: str) -> set[str]:
    """Lowercase word tokens, dropping single characters.

    Single characters are dropped so a target title like "Machine Learning
    Engineer I" doesn't hinge on matching a bare "i".
    """
    return {t for t in _TOKEN_RE.findall((text or "").lower()) if len(t) > 1}


def title_matches(job_title: str, target_titles: list[str]) -> bool:
    """True if every significant word of some target title appears in job_title.

    Whole-token subset matching, not substring matching. Substring matching
    looks simpler but quietly says "Software Engineer" matches "Software
    Engineering Manager" -- the exact false positive that wasted a smoke run.
    Requiring "engineer" as its own token rejects "engineering manager" while
    still accepting "Senior Machine Learning Engineer" and "Software Engineer,
    Machine Learning".
    """
    job_tokens = _tokens(job_title)
    if not job_tokens:
        return False
    return any(
        target_tokens and target_tokens <= job_tokens
        for target_tokens in (_tokens(t) for t in target_titles)
    )


def prefilter(jobs: list[JobListing], profile: CandidateProfile) -> tuple[list[JobListing], dict[str, int]]:
    """Splits jobs into those worth a model call and per-reason counts of the rest.

    Location is intentionally not filtered here unless the profile is
    remote-only. Allowed locations are written as countries ("United States")
    while postings name cities ("San Francisco, CA"), so a token comparison
    would drop perfectly good jobs. That judgment needs the model, which sees
    the full posting anyway.
    """
    kept: list[JobListing] = []
    reasons: dict[str, int] = {}

    for job in jobs:
        if not title_matches(job.title, profile.target_titles):
            reasons[REASON_TITLE] = reasons.get(REASON_TITLE, 0) + 1
            continue
        if profile.remote_only and not job.remote:
            reasons[REASON_NOT_REMOTE] = reasons.get(REASON_NOT_REMOTE, 0) + 1
            continue
        kept.append(job)

    return kept, reasons
