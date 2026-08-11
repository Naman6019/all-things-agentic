"""Environment + static configuration for the Career Agent job pipeline."""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

from .models import CandidateProfile

# `adk web` loads .env for the agent directory on its own, but `uvicorn main:app`
# does not -- without this, every setting below silently falls back to its
# default when running headless, which is the path Cloud Scheduler uses.
load_dotenv()

# --- GCP / model config ------------------------------------------------------
GOOGLE_CLOUD_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")

# --- Job sources: mid/large-company career portals ---------------------------
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

# --- Popular job sites, covered via aggregator feeds (not scraping) ----------
# See hackathon-project-plan.md for why LinkedIn/Indeed aren't scraped directly.
def _enabled(name: str, default: str = "true") -> bool:
    return os.environ.get(name, default).lower() == "true"


ENABLE_ARBEITNOW = _enabled("ENABLE_ARBEITNOW")
ENABLE_REMOTIVE = _enabled("ENABLE_REMOTIVE")
ENABLE_REMOTEOK = _enabled("ENABLE_REMOTEOK")
ENABLE_JOBICY = _enabled("ENABLE_JOBICY")

# --- Per-run volume cap ---------------------------------------------------------
# Hard ceiling on how many unseen jobs get handed to the model in one run. This
# is not a nicety: the Arbeitnow feed alone returns ~175 postings totalling
# ~1.8M characters in a single page, and one Greenhouse slug can return 500+.
# Uncapped, the fetch_new_jobs tool response alone would exceed the model's
# context window before any evaluation happens.
MAX_JOBS_PER_RUN = int(os.environ.get("MAX_JOBS_PER_RUN", "5"))

# --- Contact finding -----------------------------------------------------------
HUNTER_API_KEY = os.environ.get("HUNTER_API_KEY", "")  # optional fallback; see tools/job_tools.find_hiring_contact

# --- Notifications ------------------------------------------------------------
DIGEST_TO_EMAIL = os.environ.get("DIGEST_TO_EMAIL", "")
GMAIL_SENDER = os.environ.get("GMAIL_SENDER", "")

# --- Firestore ------------------------------------------------------------------
FIRESTORE_PROJECT = os.environ.get("FIRESTORE_PROJECT", GOOGLE_CLOUD_PROJECT)

PROFILE_PATH = Path(os.environ.get("PROFILE_PATH", "profile.json"))


@lru_cache(maxsize=1)
def load_candidate_profile() -> CandidateProfile:
    """Loads the candidate's job-search profile from a local JSON file.

    MVP simplification: the profile lives in a JSON file (see
    profile.example.json) rather than Firestore, since it's edited by hand
    far more often than it's read programmatically. Move it to a Firestore
    doc later if you want to edit it from a UI instead of a file.
    """
    if not PROFILE_PATH.exists():
        raise FileNotFoundError(
            f"No profile found at {PROFILE_PATH}. Copy profile.example.json to "
            f"{PROFILE_PATH} and fill in your details."
        )
    data = json.loads(PROFILE_PATH.read_text())
    return CandidateProfile(**data)
