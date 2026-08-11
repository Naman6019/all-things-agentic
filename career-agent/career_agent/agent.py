"""The two model calls in the Job Search Pipeline (Taskmaster track).

The pipeline's control flow lives in pipeline.py, in ordinary Python. These
agents do only the parts that need judgment: deciding whether one job rules
the candidate out, and drafting materials for one job that didn't.

Why the loop is not the model's job (it used to be, and this is what changed):

  - Cost. Driving fetch -> evaluate-every-job -> digest as one conversation
    keeps every evaluated job's description in the transcript, re-sent on each
    later turn. A measured 10-job run billed 285,893 input tokens for roughly
    20,000 tokens of actual job text. Per-job sessions pay for each posting
    once.
  - Correctness. "Call record_job_evaluation once per job, then send_digest
    exactly once" was an instruction the model could drop. Now a job that is
    not evaluated is a Python exception, not a silently missing row.
  - Debuggability. A wrong verdict is one request with one job in it.

`adk web .` still works for an interactive demo; it loads the evaluator below.
"""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.google_llm import Gemini
from google.genai import types as genai_types

from . import config
from .schemas import DraftedMaterials, JobVerdict

EVALUATOR_INSTRUCTIONS = """
You judge ONE job posting against ONE candidate profile. Both are given to you
in the user message. Return only the structured verdict.

Sort every requirement into exactly one of three states, and keep them apart --
this distinction is the entire point of the task:

- MET: the posting states something the candidate satisfies.
- UNMET: the posting states something the candidate demonstrably fails, e.g.
  "Requires 8+ years experience, profile has 1".
- NOT STATED: the posting is simply silent about it. Most postings never
  mention salary or visa sponsorship. This is NOT a failure. Put it in
  missing_information as something for the candidate to verify.

Set match=true when nothing is UNMET. A job with several NOT STATED
requirements and no UNMET ones is a match. Never reject a job for being silent,
and never invent a requirement the posting does not contain.

Salary: the profile's min_salary is in min_salary_currency, which is usually
not the currency the posting quotes. Convert before comparing, say so in your
reasoning, and treat it as NOT STATED when the posting gives no figure.

Unmet requirements must be specific and in plain language -- never a generic
"not a fit".
"""

DRAFTER_INSTRUCTIONS = """
You write application materials for ONE job the candidate already matched.
Both the posting and the candidate profile are in the user message.

Rewrite the candidate's REAL experience toward this posting's language. Never
invent experience, skills, employers or credentials the profile does not
support. If you are unsure whether something is true of the candidate, leave it
out rather than guess -- an inflated claim costs them the interview.

Prefer the candidate's own phrasing and any writing-voice samples in the
profile, so the letter reads like them and not like generic AI output.
"""

# Gemini on Vertex uses dynamic shared quota: a 429 is momentary contention in
# a shared pool, not a per-project ceiling that can be raised, so retrying is
# the documented fix. Without it, one 429 aborts a run.
_RETRY = genai_types.HttpRetryOptions(
    attempts=config.RETRY_ATTEMPTS,
    initial_delay=config.RETRY_INITIAL_DELAY,
    max_delay=config.RETRY_MAX_DELAY,
    exp_base=2,
    jitter=1,
    http_status_codes=[429, 503, 504],
)


def _model() -> Gemini:
    return Gemini(model=config.GEMINI_MODEL, retry_options=_RETRY)


evaluator_agent = LlmAgent(
    model=_model(),
    name="job_evaluator",
    description="Judges one job posting against the candidate's requirements.",
    instruction=EVALUATOR_INSTRUCTIONS,
    output_schema=JobVerdict,
)

drafter_agent = LlmAgent(
    model=_model(),
    name="application_drafter",
    description="Drafts tailored resume bullets and a cover letter for one matched job.",
    instruction=DRAFTER_INSTRUCTIONS,
    output_schema=DraftedMaterials,
)

# `adk web .` looks for root_agent.
root_agent = evaluator_agent
