"""The Job Search Pipeline's control flow, in ordinary Python.

Fetch, loop, evaluate, draft, digest. The model is called twice per matched job
and once per rejected one, each time with a fresh session containing only that
job -- see agent.py for why the loop stopped being the model's responsibility.

The ordering here carries the durability guarantees:

  1. A job is marked seen only after its verdict is stored, so a run that dies
     partway leaves the rest available to the next run instead of burning them.
  2. The digest is sent by this function, once, at the end -- not by a tool the
     model may call twice, or never.
"""
from __future__ import annotations

import uuid

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from . import agent, config
from .models import JobEvaluation, JobListing, TailoredMaterials
from .schemas import DraftedMaterials, JobVerdict
from .storage import firestore_store
from .tools import job_tools, notify

APP_NAME = "career-agent"


def _blank_usage() -> dict[str, int]:
    return {"input": 0, "output": 0, "thoughts": 0, "total": 0}


def _accumulate(into: dict[str, int], usage) -> None:
    if not usage:
        return
    into["input"] += usage.prompt_token_count or 0
    into["output"] += usage.candidates_token_count or 0
    into["thoughts"] += getattr(usage, "thoughts_token_count", 0) or 0
    into["total"] += usage.total_token_count or 0


async def _ask(llm_agent, prompt: str, schema, usage: dict[str, int]):
    """One model call in its own session, validated against `schema`.

    A fresh session per call is the whole cost story: the job in this prompt is
    paid for once rather than re-sent on every later turn of a shared
    conversation.
    """
    session_service = InMemorySessionService()
    session_id = f"call-{uuid.uuid4().hex[:8]}"
    await session_service.create_session(app_name=APP_NAME, user_id="pipeline", session_id=session_id)
    runner = Runner(agent=llm_agent, app_name=APP_NAME, session_service=session_service)
    message = types.Content(role="user", parts=[types.Part(text=prompt)])

    text = ""
    async for event in runner.run_async(user_id="pipeline", session_id=session_id, new_message=message):
        _accumulate(usage, getattr(event, "usage_metadata", None))
        content = getattr(event, "content", None)
        if content and content.parts:
            for part in content.parts:
                if part.text:
                    text = part.text
    return schema.model_validate_json(text)


def _profile_block() -> str:
    profile = config.load_candidate_profile()
    from dataclasses import asdict

    lines = [f"{k}: {v}" for k, v in asdict(profile).items() if k != "resume_master_text"]
    lines.append(f"resume:\n{profile.resume_master_text}")
    return "\n".join(lines)


def _job_block(job: JobListing) -> str:
    return (
        f"title: {job.title}\n"
        f"company: {job.company}\n"
        f"location: {job.location}\n"
        f"remote: {job.remote}\n"
        f"url: {job.url}\n"
        f"description:\n{job.description}"
    )


async def run_once(run_id: str) -> dict:
    """Runs one full pass and returns what it did, including token usage."""
    usage = _blank_usage()
    jobs = await job_tools.collect_new_jobs(run_id)

    profile_block = _profile_block()
    matched = 0

    for job in jobs:
        verdict: JobVerdict = await _ask(
            agent.evaluator_agent,
            f"CANDIDATE PROFILE\n{profile_block}\n\nJOB POSTING\n{_job_block(job)}",
            JobVerdict,
            usage,
        )
        firestore_store.save_evaluation(
            run_id,
            JobEvaluation(
                job_id=job.job_id,
                match=verdict.match,
                unmet_requirements=verdict.unmet_requirements,
                missing_information=verdict.missing_information,
                reasoning=verdict.reasoning,
            ),
        )
        # Claimed only now that a verdict is durably stored.
        firestore_store.mark_job_seen(job.job_id)

        if not verdict.match:
            continue

        matched += 1
        contact = await job_tools.find_hiring_contact(job.company, job.description, job.url)
        drafted: DraftedMaterials = await _ask(
            agent.drafter_agent,
            f"CANDIDATE PROFILE\n{profile_block}\n\nJOB POSTING\n{_job_block(job)}",
            DraftedMaterials,
            usage,
        )
        firestore_store.save_materials(
            TailoredMaterials(
                job_id=job.job_id,
                tailored_resume_summary=drafted.tailored_resume_summary,
                cover_letter=drafted.cover_letter,
                contact_email=contact.get("email"),
                contact_source=contact.get("source"),
            )
        )

    billed_output = usage["output"] + usage["thoughts"]
    cost_usd = round(
        usage["input"] / 1_000_000 * config.PRICE_INPUT_PER_1M_USD
        + billed_output / 1_000_000 * config.PRICE_OUTPUT_PER_1M_USD,
        4,
    )
    firestore_store.save_run_summary(
        run_id, {"tokens": usage, "cost_usd": cost_usd, "model": config.GEMINI_MODEL}
    )

    # Sent here, exactly once, because this line runs exactly once.
    apps = firestore_store.get_run_applications(run_id)
    notify.send_digest_email(
        matched=[a for a in apps if a.get("status") in ("matched", "drafted")],
        skipped=[a for a in apps if a.get("status") == "skipped"],
        run_id=run_id,
        summary=firestore_store.get_run_summary(run_id),
    )

    return {
        "run_id": run_id,
        "evaluated": len(jobs),
        "matched": matched,
        "skipped": len(jobs) - matched,
        "tokens": usage,
        "estimated_cost_usd": cost_usd,
    }
