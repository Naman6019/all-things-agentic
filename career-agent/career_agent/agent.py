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

A PUBLIC WORK section may follow the profile, listing the candidate's real
repositories. Skills demonstrated there are genuine hands-on experience and
count toward a requirement even when the resume never mentions them -- a
person's resume is a summary, not an inventory. Judge only what is stated
there; a repository name alone proves nothing.

Unmet requirements must be specific and in plain language -- never a generic
"not a fit".
"""

DRAFTER_INSTRUCTIONS = """
You produce a complete tailored resume and a cover letter for ONE job the
candidate already matched. Both the posting and the candidate profile are in
the user message.

The resume is a REORGANIZATION of the candidate's real history, not a new one:

- Every role, project, date, employer and metric must come from the profile.
  Reorder, reword and drop; never invent.
- Order experience and projects so the most relevant to THIS posting is first,
  and lead each entry's bullets with the work the posting actually asks for.
- Reword bullets toward the posting's vocabulary where the underlying work
  genuinely matches -- if the posting says "retrieval pipelines" and the
  candidate built RAG, say retrieval. Do NOT restate a requirement the
  candidate has not done.
- Keep real numbers exactly as stated. Never inflate or round them up.
- Include every skill the profile claims that is relevant; add none it doesn't.
- Drop entries that are irrelevant to this posting rather than padding. A
  resume for an AI role has no business carrying an unrelated side project;
  four relevant entries beat eight assorted ones.
- The profile may list excluded_projects. Never include those, whatever the
  posting says.
- A PUBLIC WORK section may follow the profile, listing the candidate's real
  repositories. Treat it as evidence, not resume copy: you may add a project
  from it when it matches this posting, but describe it ONLY as its
  description or README states. A repository name is not proof of what it
  does, and star counts are not achievements.

If you are unsure whether something is true of the candidate, leave it out. An
inflated claim costs them the interview, and it is their name on the document.

The cover letter is 150-250 words. Prefer the candidate's own phrasing and any
writing-voice samples in the profile, so it reads like them and not like
generic AI output.
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


def _model(model_name: str) -> Gemini:
    return Gemini(model=model_name, retry_options=_RETRY)


def _thinking(level: str | None) -> genai_types.GenerateContentConfig | None:
    """Caps reasoning depth, when asked to.

    Thinking tokens bill at the output rate and were half of a measured run's
    cost, so this is a real lever -- but it trades away reasoning the evaluator
    genuinely uses (inferring a years-of-experience bar from "staff-level",
    converting currencies). Left unset by default; change it on evidence.
    """
    if not level:
        return None
    return genai_types.GenerateContentConfig(
        thinking_config=genai_types.ThinkingConfig(thinking_level=level)
    )


# Evaluation runs once per job and drafting only once per match, so evaluation
# carries ~89% of a run's cost while drafting is where quality is visible to a
# human. Hence two models, defaulting to the same one.
evaluator_agent = LlmAgent(
    model=_model(config.EVALUATOR_MODEL),
    name="job_evaluator",
    description="Judges one job posting against the candidate's requirements.",
    instruction=EVALUATOR_INSTRUCTIONS,
    output_schema=JobVerdict,
    generate_content_config=_thinking(config.EVALUATOR_THINKING_LEVEL),
)

drafter_agent = LlmAgent(
    model=_model(config.DRAFTER_MODEL),
    name="application_drafter",
    description="Drafts tailored resume bullets and a cover letter for one matched job.",
    instruction=DRAFTER_INSTRUCTIONS,
    output_schema=DraftedMaterials,
)

# `adk web .` looks for root_agent.
root_agent = evaluator_agent
