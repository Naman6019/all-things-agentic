"""Environment + static configuration for TalentOS // Careers."""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import asdict
from pathlib import Path

from dotenv import load_dotenv

from .models import CandidateProfile

# `adk web` loads .env for the agent directory on its own, but `uvicorn main:app`
# does not -- without this, every setting below silently falls back to its
# default when running headless, which is the path Cloud Scheduler uses.
load_dotenv()

# --- Tenancy -------------------------------------------------------------------
# Every per-user document is keyed by this. It is a single hardcoded owner
# today, because there is no auth yet -- but the data model is scoped now so
# that adding real users later is wiring an identity into this one value rather
# than migrating every document.
#
# The alternative was keying documents by job id alone, which is what this
# replaced. That silently breaks the moment a second user exists: user A's
# verdict on a job marks it seen, so user B never sees the posting at all, and
# their drafts overwrite each other.
USER_ID = os.environ.get("USER_ID", "owner")

# --- Endpoint auth ---------------------------------------------------------------
# Defence in depth for the endpoints that cost money. The PRIMARY gate is Cloud
# Run IAM: deploy with --no-allow-unauthenticated and the platform rejects
# unauthenticated requests before they reach this process.
#
# This token exists for the likely footgun -- someone redeploying with
# --allow-unauthenticated to share a demo link, which would otherwise let any
# passer-by trigger billable runs. Unset by default, so it changes nothing
# until you opt in. It does NOT protect the review UI, which a browser cannot
# send custom headers to; that stays IAM-protected.
RUN_AUTH_TOKEN = os.environ.get("RUN_AUTH_TOKEN", "")

# --- GCP / model config ------------------------------------------------------
GOOGLE_CLOUD_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")

# The pipeline's two stages have very different economics, so they get their
# own model. Discovery -- judging whether a posting rules the candidate out --
# is ~89% of a run's cost, because it runs once per job while drafting runs
# only once per match. Drafting is where output quality is actually visible to
# a human, so it stays on the stronger model.
#
# Both default to GEMINI_MODEL, so setting neither changes nothing.
EVALUATOR_MODEL = os.environ.get("EVALUATOR_MODEL", GEMINI_MODEL)
DRAFTER_MODEL = os.environ.get("DRAFTER_MODEL", GEMINI_MODEL)

# --- Freelance pipeline models (TalentOS // Studio) ---
# Same pattern: evaluation is high-volume, pitching is where quality is visible.
# Both default to GEMINI_MODEL so setting neither changes nothing.
FREELANCE_EVALUATOR_MODEL = os.environ.get("FREELANCE_EVALUATOR_MODEL", GEMINI_MODEL)
FREELANCE_PITCHER_MODEL = os.environ.get("FREELANCE_PITCHER_MODEL", GEMINI_MODEL)

# Thinking tokens bill at the output rate and were half of a measured run's
# cost. Gemini 3.x models think by default; setting this to "low" trades some
# reasoning depth for a cheaper, faster evaluation. Leave unset to use the
# model's own default. Ignored by models that do not think (the -lite tiers).
EVALUATOR_THINKING_LEVEL = os.environ.get("EVALUATOR_THINKING_LEVEL", "") or None

# --- 429 retry ---------------------------------------------------------------
# Gemini on Vertex runs on dynamic shared quota: there is no per-project limit
# to raise, and quota increase requests do not apply. A 429 means the shared
# pool was busy at that moment, and the documented remedy is to retry.
# https://cloud.google.com/vertex-ai/generative-ai/docs/resources/dynamic-shared-quota
#
# Without this a single 429 aborts the whole run. It cost a run 11 jobs before
# dedupe was moved after evaluation.
RETRY_ATTEMPTS = int(os.environ.get("RETRY_ATTEMPTS", "5"))
RETRY_INITIAL_DELAY = float(os.environ.get("RETRY_INITIAL_DELAY", "2"))
RETRY_MAX_DELAY = float(os.environ.get("RETRY_MAX_DELAY", "60"))

# --- Cost accounting ------------------------------------------------------------
# USD per 1M tokens, (input, output), on the Vertex global endpoint at the
# standard tier, as of 2026-08-11. Thinking tokens bill at the output rate.
#
# NOTHING DETECTS A STALE PRICE. If a rate changes or you run a model that is
# not listed here, the reported cost is silently wrong -- an unknown model
# falls back to _FALLBACK_PRICE and is flagged in the run summary.
MODEL_PRICES: dict[str, tuple[float, float]] = {
    "gemini-3.6-flash": (1.50, 7.50),
    "gemini-3.5-flash": (1.50, 9.00),
    "gemini-3.5-flash-lite": (0.30, 2.50),
    # Retires 2026-10-16; cheapest option until then.
    "gemini-2.5-flash-lite": (0.10, 0.40),
    "gemini-2.5-flash": (0.30, 2.50),
}
_FALLBACK_PRICE = (1.50, 7.50)


def price_for(model: str) -> tuple[float, float]:
    """(input, output) USD per 1M tokens, falling back to the current flash rate."""
    return MODEL_PRICES.get(model, _FALLBACK_PRICE)


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    """Cost of one model's usage. output_tokens must already include thinking."""
    price_in, price_out = price_for(model)
    return input_tokens / 1_000_000 * price_in + output_tokens / 1_000_000 * price_out

# --- Job sources: company career portals -------------------------------------
# Free, public, per-company ATS board APIs -- no scraping, no key needed.
# Find a company's slug from its careers page URL, e.g.
# boards.greenhouse.io/<slug> or jobs.lever.co/<slug>.
def _slugs(name: str) -> list[str]:
    return [s.strip() for s in os.environ.get(name, "").split(",") if s.strip()]


GREENHOUSE_BOARD_SLUGS = _slugs("GREENHOUSE_BOARD_SLUGS")
LEVER_BOARD_SLUGS = _slugs("LEVER_BOARD_SLUGS")
# Ashby hosts most of the AI labs (openai, cohere, ...). Slug comes from
# jobs.ashbyhq.com/<slug>.
ASHBY_BOARD_SLUGS = _slugs("ASHBY_BOARD_SLUGS")
# SmartRecruiters covers a lot of mid/large non-tech-native employers. Slug
# comes from jobs.smartrecruiters.com/<slug>.
SMARTRECRUITERS_COMPANY_SLUGS = _slugs("SMARTRECRUITERS_COMPANY_SLUGS")


def _company_portals(raw: str) -> list[dict[str, str]]:
    """Validate opt-in public company portal configuration at startup."""
    if not raw.strip():
        return []
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("COMPANY_CAREER_PORTALS_JSON must be valid JSON.") from exc
    if not isinstance(payload, list):
        raise ValueError("COMPANY_CAREER_PORTALS_JSON must be a JSON array.")

    allowed = {"workable", "workday", "oracle", "successfactors", "icims", "taleo", "feed"}
    portals: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in payload:
        if not isinstance(item, dict):
            raise ValueError("Each company portal must be a JSON object.")
        provider = str(item.get("provider") or "").strip().lower()
        company = str(item.get("company") or "").strip()
        url = str(item.get("url") or "").strip()
        careers_url = str(item.get("careers_url") or "").strip()
        slug = str(item.get("slug") or "").strip()
        if provider not in allowed or not company:
            raise ValueError("Each company portal needs a supported provider and company.")
        if provider == "workable" and not slug:
            raise ValueError("Workable company portals require a slug.")
        if provider != "workable" and not url:
            raise ValueError(f"{provider} company portals require a public URL.")
        if not slug:
            slug = hashlib.sha256(f"{provider}:{company}:{url}".encode()).hexdigest()[:12]
        key = (provider, slug.casefold())
        if key in seen:
            continue
        seen.add(key)
        portals.append(
            {"provider": provider, "company": company, "slug": slug, "url": url, "careers_url": careers_url}
        )
    return portals


COMPANY_CAREER_PORTALS = _company_portals(os.environ.get("COMPANY_CAREER_PORTALS_JSON", ""))
COMPANY_PORTAL_MAX_DETAIL_PAGES = max(1, min(int(os.environ.get("COMPANY_PORTAL_MAX_DETAIL_PAGES", "25")), 100))

# --- Popular job sites, covered via aggregator feeds (not scraping) ----------
# See hackathon-project-plan.md for why LinkedIn/Indeed aren't scraped directly.
def _enabled(name: str, default: str = "true") -> bool:
    return os.environ.get(name, default).lower() == "true"


ENABLE_ARBEITNOW = _enabled("ENABLE_ARBEITNOW")
ENABLE_REMOTIVE = _enabled("ENABLE_REMOTIVE")
ENABLE_REMOTEOK = _enabled("ENABLE_REMOTEOK")
ENABLE_JOBICY = _enabled("ENABLE_JOBICY")

# --- Freelance sources (TalentOS // Studio) ---
# Public hiring boards and freelance feeds -- no scraping, no auto-submit.
ENABLE_RFORHIRE = _enabled("ENABLE_RFORHIRE", "true")
ENABLE_WWR_CONTRACT = _enabled("ENABLE_WWR_CONTRACT", "true")
ENABLE_CONTRA = _enabled("ENABLE_CONTRA", "true")
ENABLE_PEERLIST = _enabled("ENABLE_PEERLIST", "false")

# Hard cap on unseen leads handed to the model per freelance run. Same rationale
# as MAX_JOBS_PER_RUN: a single r/forhire megathread can return 50+ posts.
MAX_LEADS_PER_RUN = int(os.environ.get("MAX_LEADS_PER_RUN", "10"))

# --- Per-run volume cap ---------------------------------------------------------
# Hard ceiling on how many unseen jobs get handed to the model in one run. This
# is not a nicety: the Arbeitnow feed alone returns ~175 postings totalling
# ~1.8M characters in a single page, and one Greenhouse slug can return 500+.
# Uncapped, the fetch_new_jobs tool response alone would exceed the model's
# context window before any evaluation happens.
MAX_JOBS_PER_RUN = int(os.environ.get("MAX_JOBS_PER_RUN", "5"))

# --- Seniority exclusions --------------------------------------------------------
# Title phrases that put a role above the candidate's level. These pass the
# target-title check ("Staff Software Engineer" does contain "software
# engineer") and are then correctly rejected by the model for years of
# experience -- but only after a full evaluation has been paid for. One run
# spent nine of its ten slots doing exactly that.
#
# "senior" is included: senior postings start around 3-5 years, which is out of
# reach at ~1 year of experience, and they dominated the relevant pool. The
# cost of including it is real -- a "Senior Engineer" asking for 3 years is a
# stretch worth seeing, and this drops it unseen. Remove it from the list to
# get those back.
EXCLUDE_TITLE_KEYWORDS = [
    s.strip()
    for s in os.environ.get(
        "EXCLUDE_TITLE_KEYWORDS",
        "staff,principal,director,distinguished,fellow,vp,vice president,head of,chief,senior",
    ).split(",")
    if s.strip()
]

# --- Profile enrichment ----------------------------------------------------------
# The candidate's public work, used to tailor resumes with concrete projects.
# Cached rather than fetched per job: a person's repositories change weekly at
# most, while a run evaluates ten postings, and GitHub allows only 60
# unauthenticated requests an hour. A token raises that to 5,000 and is
# optional.
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_MAX_REPOS = int(os.environ.get("GITHUB_MAX_REPOS", "12"))
PROFILE_SOURCE_MAX_AGE_HOURS = int(os.environ.get("PROFILE_SOURCE_MAX_AGE_HOURS", "24"))

# --- Contact finding -----------------------------------------------------------
HUNTER_API_KEY = os.environ.get("HUNTER_API_KEY", "")  # optional fallback; see tools/job_tools.find_hiring_contact

# --- Langfuse Observability & Tracing ------------------------------------------
# Production-grade LLM observability, trace evaluation, latency & cost tracking.
# When keys are unset, telemetry operates in a transparent zero-overhead no-op mode.
LANGFUSE_PUBLIC_KEY = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY = os.environ.get("LANGFUSE_SECRET_KEY", "")
LANGFUSE_HOST = os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com")
ENABLE_LANGFUSE = _enabled("ENABLE_LANGFUSE", "true") and bool(LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY)

# --- LangGraph Orchestration ----------------------------------------------------
# State-machine orchestration with checkpointing and explicit node routing.
USE_LANGGRAPH_PIPELINE = _enabled("USE_LANGGRAPH_PIPELINE", "true")

# --- Notifications ------------------------------------------------------------
DIGEST_TO_EMAIL = os.environ.get("DIGEST_TO_EMAIL", "")
GMAIL_SENDER = os.environ.get("GMAIL_SENDER", "")

# --- Firestore ------------------------------------------------------------------
FIRESTORE_PROJECT = os.environ.get("FIRESTORE_PROJECT", GOOGLE_CLOUD_PROJECT)

# --- Board Scout ---------------------------------------------------------------
# One bounded Google Search-grounded call proposes public ATS boards. Every
# proposal is then checked against the ATS API before it can enter the registry.
BOARD_SCOUT_MODEL = os.environ.get("BOARD_SCOUT_MODEL", "gemini-3.5-flash")
BOARD_SCOUT_MAX_CANDIDATES = int(os.environ.get("BOARD_SCOUT_MAX_CANDIDATES", "6"))
BOARD_REGISTRY_MAX_ACTIVE = int(os.environ.get("BOARD_REGISTRY_MAX_ACTIVE", "24"))

PROFILE_PATH = Path(os.environ.get("PROFILE_PATH", "profile.json"))


_profile_cache: CandidateProfile | None = None


def _profile_from_dict(data: dict) -> CandidateProfile:
    """Builds a profile, ignoring keys the dataclass does not know.

    Stored profiles outlive the schema: a field removed in code must not make
    every saved profile unloadable.
    """
    known = {f for f in CandidateProfile.__dataclass_fields__}
    return CandidateProfile(**{k: v for k, v in data.items() if k in known})


def load_candidate_profile() -> CandidateProfile:
    """The candidate's profile: Firestore if saved, else the JSON file.

    Firestore is authoritative once the profile has been edited in the UI. The
    file remains the bootstrap path -- a fresh install, local development, and
    the read-only Secret Manager mount on Cloud Run, which is precisely why the
    editor cannot write back to it.

    Cached manually rather than with lru_cache so saving can invalidate it; a
    cached profile that ignores an edit is worse than no cache.
    """
    global _profile_cache
    if _profile_cache is not None:
        return _profile_cache

    from .storage import firestore_store  # local import: firestore_store imports config

    stored = None
    try:
        stored = firestore_store.get_profile()
    except Exception as e:  # noqa: BLE001 - fall back to the file rather than fail to start
        print(f"could not read profile from Firestore, falling back to file: {type(e).__name__}: {e}")

    if stored:
        _profile_cache = _profile_from_dict(stored)
        return _profile_cache

    if not PROFILE_PATH.exists():
        raise FileNotFoundError(
            f"No profile in Firestore and no file at {PROFILE_PATH}. Copy "
            f"profile.example.json to {PROFILE_PATH} and fill in your details, "
            "or save one from the /profile page."
        )
    _profile_cache = _profile_from_dict(json.loads(PROFILE_PATH.read_text()))
    return _profile_cache


def invalidate_profile_cache() -> None:
    """Call after saving; the next read picks up the change."""
    global _profile_cache
    _profile_cache = None


# --- Re-evaluating skipped jobs -------------------------------------------------
# A skipped job is normally never looked at again. That is fine with one trusted
# evaluator and dangerous when trialling cheaper ones, because a wrong skip is
# invisible and permanent -- nothing surfaces the job again to reveal the
# mistake. With this on, a job skipped under a different model or a different
# candidate profile is offered up again; matched jobs stay claimed either way.
#
# The cost is real: editing target_titles or switching EVALUATOR_MODEL puts
# every previously skipped job back in the queue, bounded per run by
# MAX_JOBS_PER_RUN but spread over several runs.
REEVALUATE_SKIPS_ON_CHANGE = _enabled("REEVALUATE_SKIPS_ON_CHANGE")


def profile_fingerprint() -> str:
    """Short hash of the profile, so a changed profile invalidates old skips.

    Covers the whole profile rather than just the requirement fields: a reworded
    resume changes what the drafter produces, and a changed target title changes
    what the pre-filter admits, so both are worth a fresh look.
    """
    payload = json.dumps(asdict(load_candidate_profile()), sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]


def evaluator_fingerprint() -> str:
    """Identifies what produced a verdict: this model against this profile."""
    return f"{EVALUATOR_MODEL}:{profile_fingerprint()}"
