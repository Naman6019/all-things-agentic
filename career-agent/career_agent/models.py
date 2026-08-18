"""Typed data models shared across the TalentOS // Careers job search pipeline."""
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
    # Header for the rendered resume. Kept as explicit fields rather than asked
    # of the model each time: a name and contact line must be byte-exact, and
    # re-extracting them from the resume blob on every draft invites drift.
    full_name: str = ""
    contact_line: str = ""
    # Public work the resume does not mention. Fetched from GitHub's public API
    # and cached; see sources/profile_sources.py. LinkedIn deliberately has no
    # equivalent field -- there is no lawful automated way to read a profile,
    # so it is imported from the member's own data export instead.
    github_username: str = ""
    # Projects and repositories to keep off every resume, whatever the posting.
    # The drafter already selects by relevance and does it well, but "well" is
    # not "the way you would have": this is the override, not the mechanism.
    excluded_projects: list[str] = field(default_factory=list)
    # Structured search scope used by the dashboard settings page. Kept in
    # addition to allowed_locations so older profile files still load.
    # Each item is {"location": str, "work_mode": "onsite"|"remote"|"both"}.
    location_preferences: list[dict[str, str]] = field(default_factory=list)

    # --- Freelance overlay (TalentOS // Studio) ---
    # These fields are only read by the freelance agent. The shared core above
    # (name, contact, skills, portfolio, GitHub, writing voice) feeds both
    # agents. The overlay is what makes the freelancer's profile different from
    # the job-seeker's: the job agent leads with depth and tenure; the freelance
    # agent leads with specific pain points and immediate delivery.
    freelance_niche: str = ""
    freelance_availability: str = ""
    freelance_services: list[str] = field(default_factory=list)
    freelance_portfolio_summary: str = ""
    freelance_rate_min: Optional[int] = None
    freelance_rate_currency: str = "USD"


@dataclass
class JobEvaluation:
    """The agent's match verdict for one job against the candidate profile."""

    job_id: str
    match: bool
    unmet_requirements: list[str]
    reasoning: str
    match_strength: str = "unscored"
    # Requirements the posting simply never states (salary, sponsorship, years).
    # Kept separate from unmet_requirements on purpose: "the posting doesn't say"
    # is not the same claim as "the posting rules you out", and collapsing the
    # two makes almost every job a non-match, since most postings are silent on
    # salary and sponsorship.
    missing_information: list[str] = field(default_factory=list)
    evaluated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class TailoredMaterials:
    """Draft application materials for a job the agent marked as a match."""

    job_id: str
    cover_letter: str
    # The full tailored resume as a plain dict (schemas.TailoredResume dumped),
    # so storage stays free of pydantic and old rows that predate it still load.
    tailored_resume: Optional[dict] = None
    # Superseded by tailored_resume. Kept so applications drafted before the
    # full document existed still render instead of showing an empty card.
    tailored_resume_summary: str = ""
    contact_email: Optional[str] = None
    contact_source: Optional[str] = None
    # high / medium / low. Shown to the candidate because "found in the posting"
    # and "this is where applications go" are different claims, and only one of
    # them is safe to act on without checking.
    contact_confidence: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# --- TalentOS // Studio (Freelance Client Pipeline) ---------------------------


@dataclass
class ClientLead:
    """A freelance gig posting, normalized across sources.

    Mirrors JobListing but with freelance-specific fields: budget, timeline,
    and client instead of salary, location, and company. The freelance agent
    reads these the same way the job agent reads a JobListing.
    """

    lead_id: str  # stable id: f"{source}:{external_id}"
    source: str  # "rforhire", "wwr", "contra", "peerlist"
    title: str
    client: str  # Client name or "Anonymous"
    budget: str  # "$500-1000", "Hourly: $50/hr", or ""
    timeline: str  # "2 weeks", "ASAP", or ""
    url: str
    description: str
    posted_at: Optional[str] = None
    fetched_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class LeadEvaluation:
    """The agent's fit verdict for one freelance lead.

    Same 3-state logic as JobEvaluation (MET / UNMET / NOT STATED), applied to
    freelance criteria: budget vs rate floor, services vs requirements, timeline
    vs availability.
    """

    lead_id: str
    match: bool
    unmet_requirements: list[str]
    reasoning: str
    match_strength: str = "unscored"
    missing_information: list[str] = field(default_factory=list)
    evaluated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class PitchedMaterials:
    """Drafted pitch materials for a freelance lead the agent matched.

    The pitch is the outreach message (150-300 words). The contact_method tells
    the user WHERE to send it (Reddit DM, WWR reply, Contra message). The agent
    never sends -- it drafts and deep-links; the human clicks send on the
    platform itself.
    """

    lead_id: str
    pitch_message: str
    relevant_portfolio: list[str] = field(default_factory=list)
    suggested_rate: Optional[str] = None
    contact_method: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
