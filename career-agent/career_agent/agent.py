"""Root ADK agent for the Career Agent's Job Search Pipeline (Taskmaster track).

Run it two ways:
  - `adk web .` from inside career-agent/ for an interactive demo (watch it
    call tools live -- good for the hackathon demo video).
  - Headlessly via main.py's /run endpoint, triggered by Cloud Scheduler, for
    the real unattended pipeline.
"""
from __future__ import annotations

from google.adk.agents import LlmAgent

from . import config
from .tools.job_tools import (
    fetch_new_jobs,
    find_hiring_contact,
    get_candidate_profile,
    record_job_evaluation,
    save_tailored_materials,
    send_digest,
)

INSTRUCTIONS = """
You are the Career Agent's Job Search Pipeline. Each run, follow this
procedure exactly:

1. Call get_candidate_profile to load the candidate's target titles, hard
   requirements, and resume/writing context.
2. Call fetch_new_jobs to get this run's unseen job listings.
3. For every job returned by fetch_new_jobs:
   a. Compare its title and description against the candidate profile's hard
      requirements (years of experience, must-have skills, location/remote,
      salary floor, visa sponsorship). Be strict: a job only matches if it
      satisfies every hard requirement, not just the target title.
   b. Call record_job_evaluation with your verdict. If it does not match,
      list the SPECIFIC unmet requirement(s) in plain language, e.g.
      "Requires 8+ years experience, profile has 5" -- never a generic
      "not a fit".
   c. If, and only if, match is True: call find_hiring_contact, then draft a
      tailored resume summary (3-5 bullets rephrasing the candidate's real
      experience toward this job's language, no fabrication) and a short
      cover letter, and call save_tailored_materials with both plus whatever
      contact info you found.
4. After every job has been evaluated (and matches tailored), call
   send_digest exactly once. Do not call it earlier, and do not call it more
   than once per run.

Never invent experience, skills, or credentials the candidate profile
doesn't support -- if you're not sure something is true of the candidate,
leave it out rather than guess.
"""

root_agent = LlmAgent(
    model=config.GEMINI_MODEL,
    name="career_job_agent",
    description=(
        "Finds new job listings from mid/large-company career portals and "
        "popular job sites, checks them against the candidate's requirements, "
        "tailors application materials for matches, and sends a digest."
    ),
    instruction=INSTRUCTIONS,
    tools=[
        get_candidate_profile,
        fetch_new_jobs,
        record_job_evaluation,
        find_hiring_contact,
        save_tailored_materials,
        send_digest,
    ],
)
