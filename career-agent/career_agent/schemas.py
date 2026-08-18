"""Structured outputs for the per-job model calls.

Pydantic rather than the dataclasses in models.py because ADK's `output_schema`
takes a pydantic model and validates the response against it. That validation
is the point: it replaces "the agent should call record_job_evaluation with
these arguments" with a response that either parses or fails loudly.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class JobVerdict(BaseModel):
    """One job judged against the candidate profile."""

    match: bool = Field(
        description=(
            "True if nothing the posting actually STATES rules the candidate out. "
            "A requirement the posting is silent about must not make this False."
        )
    )
    match_strength: Literal["strong", "medium", "weak"] = Field(
        description=(
            "Strength of fit based on stated requirements and demonstrated candidate evidence. "
            "Use strong for direct evidence across most important requirements, medium when the "
            "candidate qualifies but important evidence is incomplete, and weak when fit is "
            "marginal or the job has an unmet requirement."
        )
    )
    unmet_requirements: list[str] = Field(
        default_factory=list,
        description=(
            "Requirements the posting states and the candidate demonstrably fails, "
            "specific and human-readable, e.g. 'Requires 8+ years, profile has 1'. "
            "Empty when match is true."
        ),
    )
    missing_information: list[str] = Field(
        default_factory=list,
        description=(
            "Requirements the posting never states, so they could not be checked, "
            "e.g. 'Posting does not state a salary range'. These are for the "
            "candidate to verify, never reasons to reject."
        ),
    )
    reasoning: str = Field(description="One or two sentences explaining the verdict.")


class ResumeEntry(BaseModel):
    """One role, project or credential on the resume."""

    title: str = Field(description="Role or project name, exactly as the candidate states it.")
    organization: str = Field(default="", description="Employer, client or 'Personal project'.")
    dates: str = Field(default="", description="Date range as the candidate states it. Never invent dates.")
    bullets: list[str] = Field(
        default_factory=list,
        description=(
            "Achievement lines for this entry, reworded toward the posting's language and "
            "reordered so the most relevant comes first. Keep the candidate's real metrics."
        ),
    )


class TailoredResume(BaseModel):
    """A complete resume, reorganized for one posting.

    Structured rather than a blob of markdown so it renders deterministically to
    a consistent document. The model decides what to emphasise and how to word
    it; layout is not its job.
    """

    headline: str = Field(
        description="One line under the name, e.g. 'AI/ML Engineer - LLMs, RAG, Multi-Agent Systems'."
    )
    summary: str = Field(
        description="2-3 sentences positioning the candidate for THIS posting, using only real experience."
    )
    skills: list[str] = Field(
        default_factory=list,
        description=(
            "The candidate's real skills, filtered and ordered so those the posting asks for "
            "come first. Never add a skill the profile does not claim."
        ),
    )
    experience: list[ResumeEntry] = Field(default_factory=list, description="Paid roles, most recent first.")
    projects: list[ResumeEntry] = Field(
        default_factory=list, description="Projects, most relevant to this posting first."
    )
    education: list[str] = Field(
        default_factory=list, description="Degrees, certifications and publications, one per line."
    )


class DraftedMaterials(BaseModel):
    """Application materials for a job that matched."""

    tailored_resume: TailoredResume = Field(
        description=(
            "The candidate's full resume, reorganized and reworded for this posting. "
            "Every entry must correspond to something in the candidate's profile -- "
            "reorder, reword and drop, but never invent."
        )
    )
    cover_letter: str = Field(description="A 150-250 word cover letter for this posting.")


# --- TalentOS // Studio (Freelance Client Pipeline) ---------------------------


class LeadVerdict(BaseModel):
    """One freelance lead judged against the freelancer's profile.

    Same 3-state logic as JobVerdict, applied to freelance criteria. Silence is
    never a rejection -- a lead that doesn't state a budget is an opportunity
    to negotiate, not a mismatch.
    """

    match: bool = Field(
        description=(
            "True if nothing the lead actually STATES rules the freelancer out. "
            "A requirement the lead is silent about (budget, timeline) must not "
            "make this False."
        )
    )
    match_strength: Literal["strong", "medium", "weak"] = Field(
        description=(
            "Strength of fit: strong when the freelancer's services directly "
            "match the stated needs and portfolio demonstrates similar work, "
            "medium when qualified but evidence is incomplete, weak when fit "
            "is marginal."
        )
    )
    unmet_requirements: list[str] = Field(
        default_factory=list,
        description=(
            "Requirements the lead states and the freelancer demonstrably fails, "
            "e.g. 'Looking for agency, profile is solo freelancer'. "
            "Empty when match is true."
        ),
    )
    missing_information: list[str] = Field(
        default_factory=list,
        description=(
            "Things the lead never states -- budget, timeline, team size. "
            "These are for the freelancer to clarify in the pitch, never "
            "reasons to reject."
        ),
    )
    reasoning: str = Field(description="One or two sentences explaining the verdict.")


class PitchDraft(BaseModel):
    """A drafted pitch for one matched freelance lead.

    The pitch leads with SPECIFIC PAIN POINTS the client described and the
    freelancer's PREVIOUS SIMILAR SOLUTIONS -- not generic fluff. The agent
    never sends; it drafts and identifies where to send.
    """

    pitch_message: str = Field(
        description=(
            "150-300 word pitch referencing the client's actual problem by "
            "quoting/paraphrasing their post, citing 1-2 specific portfolio "
            "projects that solved similar problems, stating timeline "
            "commitment, and suggesting a rate within the profile's range. "
            "In the freelancer's own voice from writing_voice_samples."
        )
    )
    relevant_portfolio: list[str] = Field(
        default_factory=list,
        description=(
            "Names of specific portfolio projects or GitHub repositories that "
            "demonstrate the skill this lead needs. The pitch should reference "
            "these. Never fabricate projects."
        ),
    )
    suggested_rate: str = Field(
        default="",
        description="Suggested rate based on the profile's rate floor and the lead's stated budget.",
    )
    contact_method: str = Field(
        default="",
        description="How to reach the client: 'DM on Reddit', 'Reply on WWR', 'Apply on Contra'.",
    )
