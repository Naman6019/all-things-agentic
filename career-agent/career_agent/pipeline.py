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
from dataclasses import asdict

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from . import agent, config
from .models import JobEvaluation, JobListing, TailoredMaterials
from .schemas import DraftedMaterials, JobVerdict
from .sources import profile_sources
from .storage import firestore_store
from .tools import job_tools, notify

APP_NAME = "career-agent"


def _accumulate(by_model: dict[str, dict[str, int]], model: str, usage) -> None:
    """Adds one call's usage to its model's bucket.

    Kept per model, not pooled: the two stages can run different models at
    different rates, and a single pooled total costed at one rate would be
    silently wrong -- which defeats the point of measuring cost at all.
    """
    if not usage:
        return
    bucket = by_model.setdefault(model, {"input": 0, "output": 0, "thoughts": 0, "total": 0})
    bucket["input"] += usage.prompt_token_count or 0
    bucket["output"] += usage.candidates_token_count or 0
    bucket["thoughts"] += getattr(usage, "thoughts_token_count", 0) or 0
    bucket["total"] += usage.total_token_count or 0


def _summarize_cost(by_model: dict[str, dict[str, int]]) -> tuple[float, dict, dict]:
    """Returns (total USD, per-model cost, combined token totals)."""
    per_model_cost: dict[str, float] = {}
    combined = {"input": 0, "output": 0, "thoughts": 0, "total": 0}
    for model, tokens in by_model.items():
        # Thinking bills at the output rate.
        billed_output = tokens["output"] + tokens["thoughts"]
        per_model_cost[model] = round(config.cost_usd(model, tokens["input"], billed_output), 4)
        for key in combined:
            combined[key] += tokens[key]
    return round(sum(per_model_cost.values()), 4), per_model_cost, combined


async def _ask(llm_agent, model: str, prompt: str, schema, usage: dict[str, dict[str, int]]):
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
        _accumulate(usage, model, getattr(event, "usage_metadata", None))
        content = getattr(event, "content", None)
        if content and content.parts:
            for part in content.parts:
                if part.text:
                    text = part.text
    return schema.model_validate_json(text)


def _profile_block() -> str:
    profile = config.load_candidate_profile()
    lines = [f"{k}: {v}" for k, v in asdict(profile).items() if k != "resume_master_text"]
    lines.append(f"resume:\n{profile.resume_master_text}")
    return "\n".join(lines)


async def _public_work() -> dict | None:
    """The candidate's public work, cached. None when unavailable.

    Errors are deliberately not cached: a rate limit is transient, and storing
    it would suppress enrichment for the whole TTL.
    """
    profile = config.load_candidate_profile()
    if not profile.github_username:
        return None

    cached = firestore_store.get_profile_source("github", config.PROFILE_SOURCE_MAX_AGE_HOURS)
    if cached is None:
        async with job_tools._client() as client:
            fetched = await profile_sources.fetch_github(
                profile.github_username,
                client,
                max_repos=config.GITHUB_MAX_REPOS,
                token=config.GITHUB_TOKEN,
            )
        cached = asdict(fetched)
        if fetched.error:
            print(f"github enrichment unavailable: {fetched.error}")
        else:
            firestore_store.save_profile_source("github", cached)
    return cached


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
    usage: dict[str, dict[str, int]] = {}
    evaluator = config.evaluator_fingerprint()
    jobs = await job_tools.collect_new_jobs(run_id, evaluator=evaluator)

    profile_block = _profile_block()

    # Fetched once per run. Both stages see it, in different sizes: the
    # evaluator needs it to credit skills the resume never mentions, or it
    # rejects jobs the candidate is genuinely qualified for. That is not
    # hypothetical -- a Django/Celery posting was skipped as "not demonstrated"
    # while the candidate had a Django REST + Celery + Redis project on GitHub.
    public_work = (await _public_work()) if jobs else None
    evidence_brief = profile_sources.as_prompt_block(public_work, compact=True) if public_work else ""
    evidence_full = profile_sources.as_prompt_block(public_work) if public_work else ""
    matched = 0

    for job in jobs:
        verdict: JobVerdict = await _ask(
            agent.evaluator_agent,
            config.EVALUATOR_MODEL,
            f"CANDIDATE PROFILE\n{profile_block}\n\n"
            + (f"{evidence_brief}\n\n" if evidence_brief else "")
            + f"JOB POSTING\n{_job_block(job)}",
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
        # Claimed only now that a verdict is durably stored. The evaluator
        # fingerprint rides along so a skip can be revisited if the model or
        # the profile changes; see firestore_store.find_unseen.
        firestore_store.mark_job_seen(job.job_id, matched=verdict.match, evaluator=evaluator)

        if not verdict.match:
            continue

        matched += 1
        contact = await job_tools.find_hiring_contact(job.company, job.description, job.url)
        drafted: DraftedMaterials = await _ask(
            agent.drafter_agent,
            config.DRAFTER_MODEL,
            f"CANDIDATE PROFILE\n{profile_block}\n\n"
            + (f"{evidence_full}\n\n" if evidence_full else "")
            + f"JOB POSTING\n{_job_block(job)}",
            DraftedMaterials,
            usage,
        )
        firestore_store.save_materials(
            TailoredMaterials(
                job_id=job.job_id,
                tailored_resume=drafted.tailored_resume.model_dump(),
                cover_letter=drafted.cover_letter,
                contact_email=contact.get("email"),
                contact_source=contact.get("source"),
                contact_confidence=contact.get("confidence"),
            )
        )

    total_cost, cost_by_model, tokens = _summarize_cost(usage)
    firestore_store.save_run_summary(
        run_id,
        {
            "tokens": tokens,
            "tokens_by_model": usage,
            "cost_by_model": cost_by_model,
            "cost_usd": total_cost,
            "models": {"evaluator": config.EVALUATOR_MODEL, "drafter": config.DRAFTER_MODEL},
            "unpriced_models": sorted(m for m in usage if m not in config.MODEL_PRICES),
        },
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
        "tokens_by_model": usage,
        "cost_by_model": cost_by_model,
        "estimated_cost_usd": total_cost,
    }
