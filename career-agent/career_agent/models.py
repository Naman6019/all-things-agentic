"""Typed data models shared across the Career Agent's job search pipeline."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


@dataclass
class JobListing:
    """A single job posting, normalized across sources."""

    job_id: str  # stable id: f"{source}:{external_id}"
    source: str  # e.g. "greenhouse:stripe", "arbeitnow"
    title: str
    company: str
    location: str
    remote: bool
    url: str
    description: str
    posted_at: Optional[str] = None
    fetched_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class CandidateProfile:
    """The user's job-search profile: what they want and what they require."""

    target_titles: list[str]
    must_have_skills: list[str]
    min_years_experience: int
    remote_only: bool
    allowed_locations: list[str]
    min_salary: Optional[int]
    # Currency of min_salary, as an ISO code. Without this, a floor of 800000
    # (INR) reads as 800000 of whatever the posting quotes -- most job boards
    # quote USD, so the comparison silently comes out ~85x wrong in one
    # direction or the other. The evaluating model is told to convert before
    # comparing, and to treat the requirement as unknown rather than unmet when
    # a posting states no salary at all.
    min_salary_currency: str
    needs_visa_sponsorship: bool
    resume_master_text: str
    writing_voice_samples: list[str] = field(default_factory=list)
    portfolio_links: list[str] = field(default_factory=list)


@dataclass
class JobEvaluation:
    """The agent's match verdict for one job against the candidate profile."""

    job_id: str
    match: bool
    unmet_requirements: list[str]
    reasoning: str
    evaluated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class TailoredMaterials:
    """Draft application materials for a job the agent marked as a match."""

    job_id: str
    tailored_resume_summary: str
    cover_letter: str
    contact_email: Optional[str] = None
    contact_source: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
