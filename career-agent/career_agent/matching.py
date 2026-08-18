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

from . import config
from .models import CandidateProfile, JobListing

# Keep '+' and '#' so "c++" and "c#" survive tokenization.
_TOKEN_RE = re.compile(r"[a-z0-9+#]+")

REASON_TITLE = "title_not_in_target_titles"
REASON_NOT_REMOTE = "remote_only_but_posting_is_onsite"
REASON_SENIORITY = "title_above_target_seniority"
REASON_LOCATION = "outside_saved_location_preferences"
REASON_REMOTE_REGION = "remote_region_not_in_preferences"

_INDIA_MARKERS = (
    "india", "kolkata", "bengaluru", "bangalore", "mumbai", "delhi",
    "gurugram", "gurgaon", "hyderabad", "pune", "chennai", "noida",
)
_EARLY_CAREER_TITLE_MARKERS = (
    "junior", "entry level", "entry-level", "new grad", "graduate",
    "associate", "engineer i", "engineer 1",
)
_SPONSORSHIP_POSITIVE = (
    "visa sponsorship is available", "visa sponsorship available",
    "we sponsor visas", "will sponsor", "immigration sponsorship",
    "work visa sponsorship", "sponsorship provided",
)
_SPONSORSHIP_NEGATIVE = (
    "unable to sponsor", "cannot sponsor", "can not sponsor", "no sponsorship",
    "not sponsor", "without sponsorship",
)
_GLOBAL_REMOTE_MARKERS = ("anywhere", "worldwide", "world-wide", "global", "international")
_GENERIC_REMOTE_LOCATIONS = ("remote", "remoto", "work from home", "wfh")
_MIDDLE_EAST_MARKERS = (
    "middle east", "mena", "uae", "united arab emirates", "dubai", "abu dhabi",
    "saudi arabia", "saudi", "riyadh", "jeddah", "qatar", "doha", "bahrain",
    "manama", "kuwait", "kuwait city", "oman", "muscat", "jordan", "amman",
)


# How many unrelated words may sit inside a matched title phrase. 1 admits
# "Machine Learning [Infrastructure] Engineer" while still rejecting "Data
# [Center Electrical] Engineer", which needs 2.
MAX_PHRASE_GAP = 1


def _tokens(text: str) -> list[str]:
    """Lowercase word tokens in order, dropping single characters.

    Single characters go so a target like "Machine Learning Engineer I" doesn't
    hinge on a bare "i", and so punctuation variants ("AI/ML Engineer" vs
    "AI ML Engineer") normalize identically.

    Trailing '+' is stripped so "Staff+ Software Engineer" tokenizes to "staff"
    and matches a "staff" exclusion -- without this it becomes "staff+" and
    slips through, which real Anthropic postings did. The '+' is still kept
    when stripping it would leave nothing meaningful, so "c++" survives as a
    token in its own right.
    """
    out = []
    for raw in _TOKEN_RE.findall((text or "").lower()):
        stripped = raw.rstrip("+")
        if len(stripped) > 1:
            out.append(stripped)
        elif len(raw) > 1:
            out.append(raw)
    return out


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


def is_above_seniority(job_title: str, exclude_keywords: list[str]) -> bool:
    """True if the title marks a level the candidate is not a candidate for.

    Matched as contiguous phrases over tokens, not substrings: "head of" must
    not fire on "overhead", and "vp" must not fire on "vpn". These titles pass
    the target-title check by design -- "Staff Software Engineer" really does
    contain "software engineer" -- so without this they reach the model and get
    correctly rejected at full cost.
    """
    job = _tokens(job_title)
    if not job:
        return False
    return any(_appears_in_order(_tokens(kw), job, max_gap=0) for kw in exclude_keywords)


def is_india_location(location: str) -> bool:
    normalized = (location or "").lower()
    return any(marker in normalized for marker in _INDIA_MARKERS)


def explicitly_offers_sponsorship(description: str) -> bool:
    normalized = (description or "").lower()
    if any(marker in normalized for marker in _SPONSORSHIP_NEGATIVE):
        return False
    return any(marker in normalized for marker in _SPONSORSHIP_POSITIVE)


def is_early_career(job: JobListing) -> bool:
    title = (job.title or "").lower()
    if any(marker in title for marker in _EARLY_CAREER_TITLE_MARKERS):
        return True
    description = (job.description or "").lower()
    return bool(
        re.search(r"(?:0|1|2)\+?\s*(?:years?|yrs?)[^.!\n]{0,40}(?:experience|professional)", description)
        or re.search(r"(?:experience|professional)[^.!\n]{0,40}(?:0|1|2)\+?\s*(?:years?|yrs?)", description)
    )


def remote_location_excludes_india(location: str) -> bool:
    """True when a remote label also names a non-India geographic restriction."""
    normalized = re.sub(r"[|,;/()\-]+", " ", (location or "").lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if not normalized or is_india_location(normalized):
        return False
    if any(marker in normalized for marker in _GLOBAL_REMOTE_MARKERS):
        return False
    remainder = normalized
    for marker in _GENERIC_REMOTE_LOCATIONS:
        remainder = remainder.replace(marker, " ")
    return bool(re.sub(r"\s+", " ", remainder).strip())


MAX_LOCATION_PREFERENCES = 5


def preferences_from_allowed_locations(
    allowed_locations: list[str], existing: list[dict[str, str]] | None = None
) -> list[dict[str, str]]:
    """Rebuild the structured scope from a plain list of location names.

    The legacy /profile form only knows about allowed_locations, so without
    this the structured preferences it cannot see would go stale and silently
    outrank whatever the human just typed. Work modes already chosen for a
    location survive, because a flat list carries no opinion about them.
    """
    saved_modes = {
        str(item.get("location", "")).strip().casefold(): str(item.get("work_mode", "")).lower()
        for item in (existing or [])
    }
    rebuilt: list[dict[str, str]] = []
    for location in allowed_locations:
        location = str(location).strip()
        if not location:
            continue
        mode = saved_modes.get(location.casefold())
        if mode not in {"onsite", "remote", "both"}:
            mode = "remote" if _is_global_preference(location) else "both"
        rebuilt.append(
            {"location": "Worldwide" if _is_global_preference(location) else location, "work_mode": mode}
        )
    return validated_location_preferences(rebuilt)


def validated_location_preferences(raw: list[dict[str, str]]) -> list[dict[str, str]]:
    """Drop malformed and duplicate entries, then cap.

    Capping after validation, not before: slicing first means a handful of bad
    entries can starve out the good ones behind them.
    """
    preferences: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in raw:
        location = str(item.get("location", "")).strip()
        mode = str(item.get("work_mode", "both")).strip().lower()
        key = (location.casefold(), mode)
        if not location or mode not in {"onsite", "remote", "both"} or key in seen:
            continue
        seen.add(key)
        preferences.append({"location": location, "work_mode": mode})
        if len(preferences) == MAX_LOCATION_PREFERENCES:
            break
    return preferences


def normalized_location_preferences(profile: CandidateProfile) -> list[dict[str, str]]:
    """Structured search scope, with a compatibility path for older profiles.

    The single source of truth for what the saved scope means -- a second
    implementation elsewhere is how the two profile editors came to disagree.
    """
    if profile.location_preferences:
        return validated_location_preferences(profile.location_preferences)
    return preferences_from_allowed_locations(profile.allowed_locations)


def _normalized_place(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[|,;/()\-]+", " ", (value or "").lower())).strip()


def _is_global_preference(location: str) -> bool:
    normalized = _normalized_place(location)
    return normalized in {"worldwide", "anywhere", "global", "international", "remote", "remoto"}


def _location_matches(job_location: str, preferred_location: str) -> bool:
    job_place = _normalized_place(job_location)
    preferred = _normalized_place(preferred_location)
    if not job_place:
        return True
    if preferred == "india":
        return is_india_location(job_place)
    if preferred in {"middle east", "mena"}:
        return any(re.search(rf"\b{re.escape(marker)}\b", job_place) for marker in _MIDDLE_EAST_MARKERS)
    if preferred in {"united states", "usa", "us"}:
        return bool(re.search(r"\b(?:united states|usa|us)\b", job_place))
    if preferred in {"united kingdom", "uk"}:
        return bool(re.search(r"\b(?:united kingdom|uk)\b", job_place))
    return preferred in job_place or job_place in preferred


def _remote_region(location: str) -> str:
    """The geography a remote label names, e.g. "Remote - India" -> "india".

    Comparing the raw label against a preference does not work: "remote india"
    is neither a substring of nor a superstring of "bengaluru india", so a
    remote-from-India posting looks unrelated to an Indian city preference.
    """
    remainder = _normalized_place(location)
    for marker in _GENERIC_REMOTE_LOCATIONS:
        remainder = remainder.replace(marker, " ")
    return re.sub(r"\s+", " ", remainder).strip()


def _is_generic_or_global_remote(location: str) -> bool:
    normalized = _normalized_place(location)
    if not normalized:
        return True
    if any(marker in normalized for marker in _GLOBAL_REMOTE_MARKERS):
        return True
    return not _remote_region(location)


def location_policy_allows(job: JobListing, profile: CandidateProfile) -> bool:
    """Apply the profile's saved locations and work modes before model calls."""
    if not job.location:
        return True  # the evaluator sees the full posting and reports uncertainty
    preferences = normalized_location_preferences(profile)
    if not preferences:
        # A profile with no saved scope has no location policy to apply.
        # Failing open keeps this a filter; failing closed drops every job in
        # every run and only says so in the run summary's reason counts.
        return True

    mode = "remote" if job.remote else "onsite"
    matching_preferences = [
        item for item in preferences if item["work_mode"] in {mode, "both"}
    ]
    if job.remote:
        if not matching_preferences:
            return False
        # An unrestricted remote label rules nobody out: whoever wants remote
        # work at all can do this job from wherever they saved.
        if _is_generic_or_global_remote(job.location):
            return True
        region = _remote_region(job.location)
        return any(_location_matches(region, item["location"]) for item in matching_preferences)

    location_match = any(
        not _is_global_preference(item["location"])
        and _location_matches(job.location, item["location"])
        for item in matching_preferences
    )
    if not location_match:
        return False
    if profile.needs_visa_sponsorship and not is_india_location(job.location):
        return is_early_career(job) and explicitly_offers_sponsorship(job.description)
    return True


def prefilter(jobs: list[JobListing], profile: CandidateProfile) -> tuple[list[JobListing], dict[str, int]]:
    """Splits jobs into those worth a model call and per-reason counts of the rest.

    Location policy follows the saved work modes. International onsite jobs
    still need early-career and sponsorship evidence when the profile says
    sponsorship is required.
    """
    kept: list[JobListing] = []
    reasons: dict[str, int] = {}

    for job in jobs:
        if not title_matches(job.title, profile.target_titles):
            reasons[REASON_TITLE] = reasons.get(REASON_TITLE, 0) + 1
            continue
        if is_above_seniority(job.title, config.EXCLUDE_TITLE_KEYWORDS):
            reasons[REASON_SENIORITY] = reasons.get(REASON_SENIORITY, 0) + 1
            continue
        if profile.remote_only and not job.remote:
            reasons[REASON_NOT_REMOTE] = reasons.get(REASON_NOT_REMOTE, 0) + 1
            continue
        if not location_policy_allows(job, profile):
            reason = REASON_REMOTE_REGION if job.remote else REASON_LOCATION
            reasons[reason] = reasons.get(reason, 0) + 1
            continue
        kept.append(job)

    return kept, reasons
