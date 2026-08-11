"""Structured outputs for the per-job model calls.

Pydantic rather than the dataclasses in models.py because ADK's `output_schema`
takes a pydantic model and validates the response against it. That validation
is the point: it replaces "the agent should call record_job_evaluation with
these arguments" with a response that either parses or fails loudly.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class JobVerdict(BaseModel):
    """One job judged against the candidate profile."""

    match: bool = Field(
        description=(
            "True if nothing the posting actually STATES rules the candidate out. "
            "A requirement the posting is silent about must not make this False."
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


class DraftedMaterials(BaseModel):
    """Application materials for a job that matched."""

    tailored_resume_summary: str = Field(
        description=(
            "3-5 bullet points rewriting the candidate's real experience toward this "
            "posting's language. Never fabricate experience, skills or credentials."
        )
    )
    cover_letter: str = Field(description="A 150-250 word cover letter for this posting.")
