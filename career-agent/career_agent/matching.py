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


# How many unrelated words may sit inside a matched title phrase. 1 admits
# "Machine Learning [Infrastructure] Engineer" while still rejecting "Data
# [Center Electrical] Engineer", which needs 2.
MAX_PHRASE_GAP = 1


def _tokens(text: str) -> list[str]:
    """Lowercase word tokens in order, dropping single characters.

    Single characters go so a target like "Machine Learning Engineer I" doesn't
    hinge on a bare "i", and so punctuation variants ("AI/ML Engineer" vs
    "AI ML Engineer") normalize identically.
    """
    return [t for t in _TOKEN_RE.findall((text or "").lower()) if len(t) > 1]


def _appears_in_order(target: list[str], job: list[str], max_gap: int = MAX_PHRASE_GAP) -> bool:
    """True if target's words appear in job in order, tightly enough to be the same role.

    Tries every possible starting position rather than taking the first match,
    since a greedy scan can pick an early occurrence that spreads the span too
    wide and miss a tighter one later in the title.
    """
    if not target:
        return False
    for start in (i for i, tok in enumerate(job) if tok == target[0]):
        pos, matched = start, 1
        for want in target[1:]:
            try:
                pos = job.index(want, pos + 1)
            except ValueError:
                matched = -1
                break
            matched += 1
        if matched == len(target) and (pos - start + 1) - len(target) <= max_gap:
            return True
    return False


def title_matches(job_title: str, target_titles: list[str]) -> bool:
    """True if some target title appears in job_title as a tight, in-order phrase.

    Three approaches were tried against real board data; the first two produced
    false positives that wasted whole runs:

    - Substring matching says "Software Engineer" matches "Software
      ENGINEERING Manager". Tokenizing fixes that: different tokens.
    - Token-SUBSET matching (all target words present anywhere) says "Data
      Engineer" matches "Data Center Electrical Engineer" -- the words are all
      there, just not together.
    - Strict contiguity fixes that but loses "Machine Learning Infrastructure
      Engineer", a genuine match, because a qualifier sits mid-phrase.

    So: in order, with at most MAX_PHRASE_GAP intervening words.
    """
    job = _tokens(job_title)
    if not job:
        return False
    return any(_appears_in_order(_tokens(t), job) for t in target_titles)


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
