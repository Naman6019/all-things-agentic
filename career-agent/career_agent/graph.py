"""LangGraph orchestration workflow for the TalentOS // Careers Job Search Pipeline.

Formalizes the pipeline execution as a compiled StateGraph with explicit nodes,
conditional routing, and Langfuse tracing.

The workflow operates per-batch and loops over individual job evaluations with
fresh per-job agent sessions to guarantee constant per-job token economics and
deterministic state progression.
"""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import asdict
from typing import Annotated, Any, TypedDict

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from langgraph.graph import END, START, StateGraph

from . import agent, config, telemetry
from .models import JobEvaluation, JobListing, TailoredMaterials
from .schemas import DraftedMaterials, JobVerdict
from .sources import profile_sources
from .storage import firestore_store
from .tools import job_tools, notify

APP_NAME = "career-agent"


class PipelineGraphState(TypedDict, total=False):
    run_id: str
    user_id: str
    max_jobs: int | None
    registry_only: bool
    evaluator_fingerprint: str
    profile_block: str
    evidence_brief: str
    evidence_full: str
    jobs: list[JobListing]
    current_index: int
    current_job: JobListing | None
    current_verdict: JobVerdict | None
    current_contact: dict | None
    current_drafted: DraftedMaterials | None
    matched_count: int
    skipped_count: int
    usage: dict[str, dict[str, int]]
    errors: dict[str, str]
    trace: Any
    result_summary: dict[str, Any]


def _accumulate_usage(by_model: dict[str, dict[str, int]], model: str, usage) -> None:
    if not usage:
        return
    bucket = by_model.setdefault(model, {"input": 0, "output": 0, "thoughts": 0, "total": 0})
    bucket["input"] += getattr(usage, "prompt_token_count", 0) or 0
    bucket["output"] += getattr(usage, "candidates_token_count", 0) or 0
    bucket["thoughts"] += getattr(usage, "thoughts_token_count", 0) or 0
    bucket["total"] += getattr(usage, "total_token_count", 0) or 0


async def _ask_agent(
    llm_agent,
    model: str,
    prompt: str,
    schema,
    usage: dict[str, dict[str, int]],
    trace: Any = None,
    generation_name: str = "Generation",
):
    """Executes an isolated ADK agent call with schema validation and telemetry."""
    session_service = InMemorySessionService()
    session_id = f"call-{uuid.uuid4().hex[:8]}"
    await session_service.create_session(app_name=APP_NAME, user_id="pipeline", session_id=session_id)
    runner = Runner(agent=llm_agent, app_name=APP_NAME, session_service=session_service)
    message = types.Content(role="user", parts=[types.Part(text=prompt)])

    text = ""
    last_usage = None
    async for event in runner.run_async(user_id="pipeline", session_id=session_id, new_message=message):
        event_usage = getattr(event, "usage_metadata", None)
        if event_usage:
            last_usage = event_usage
            _accumulate_usage(usage, model, event_usage)
        content = getattr(event, "content", None)
        if content and content.parts:
            for part in content.parts:
                if part.text:
                    text = part.text

    parsed = schema.model_validate_json(text)

    # Record generation in Langfuse
    if trace:
        telemetry.record_generation(
            trace=trace,
            name=generation_name,
            model=model,
            input_messages=prompt,
            output_text=text,
            usage=last_usage,
            metadata={"schema": schema.__name__},
        )

    return parsed


def _build_profile_block() -> str:
    profile = config.load_candidate_profile()
    lines = [f"{k}: {v}" for k, v in asdict(profile).items() if k != "resume_master_text"]
    lines.append(f"resume:\n{profile.resume_master_text}")
    return "\n".join(lines)


async def _fetch_public_work() -> dict | None:
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
        if not fetched.error:
            firestore_store.save_profile_source("github", cached)
    return cached


def _format_job_block(job: JobListing) -> str:
    return (
        f"title: {job.title}\n"
        f"company: {job.company}\n"
        f"location: {job.location}\n"
        f"remote: {job.remote}\n"
        f"url: {job.url}\n"
        f"description:\n{job.description}"
    )


# -----------------------------------------------------------------------------
# Graph Node Definitions
# -----------------------------------------------------------------------------


async def node_ingest_and_prefilter(state: PipelineGraphState) -> PipelineGraphState:
    """Collects and pre-filters jobs across ATS and aggregator sources."""
    run_id = state["run_id"]
    trace = telemetry.create_pipeline_trace(run_id=run_id, user_id=state.get("user_id"))
    state["trace"] = trace

    with telemetry.trace_span(trace, name="Ingest and Pre-filter"):
        evaluator = config.evaluator_fingerprint()
        jobs = await job_tools.collect_new_jobs(
            run_id,
            evaluator=evaluator,
            max_jobs=state.get("max_jobs"),
            registry_only=state.get("registry_only", False),
        )

        profile_block = _build_profile_block()
        public_work = (await _fetch_public_work()) if jobs else None
        evidence_brief = profile_sources.as_prompt_block(public_work, compact=True) if public_work else ""
        evidence_full = profile_sources.as_prompt_block(public_work) if public_work else ""

    return {
        **state,
        "trace": trace,
        "evaluator_fingerprint": evaluator,
        "jobs": jobs,
        "profile_block": profile_block,
        "evidence_brief": evidence_brief,
        "evidence_full": evidence_full,
        "current_index": 0,
        "matched_count": 0,
        "skipped_count": 0,
        "usage": {},
        "errors": {},
    }


async def node_evaluate_job(state: PipelineGraphState) -> PipelineGraphState:
    """Evaluates the current job posting against candidate requirements."""
    idx = state["current_index"]
    jobs = state["jobs"]
    if idx >= len(jobs):
        return state

    job = jobs[idx]
    state["current_job"] = job
    trace = state.get("trace")
    usage = state.get("usage", {})

    prompt = (
        f"CANDIDATE PROFILE\n{state['profile_block']}\n\n"
        + (f"{state['evidence_brief']}\n\n" if state.get("evidence_brief") else "")
        + f"JOB POSTING\n{_format_job_block(job)}"
    )

    with telemetry.trace_span(trace, name=f"Evaluate Job: {job.title} @ {job.company}"):
        verdict: JobVerdict = await _ask_agent(
            agent.evaluator_agent,
            config.EVALUATOR_MODEL,
            prompt,
            JobVerdict,
            usage,
            trace=trace,
            generation_name=f"Evaluator: {job.title}",
        )

    firestore_store.save_evaluation(
        state["run_id"],
        JobEvaluation(
            job_id=job.job_id,
            match=verdict.match,
            unmet_requirements=verdict.unmet_requirements,
            missing_information=verdict.missing_information,
            reasoning=verdict.reasoning,
            match_strength=verdict.match_strength,
        ),
    )

    return {
        **state,
        "current_verdict": verdict,
        "usage": usage,
    }


def route_verdict(state: PipelineGraphState) -> str:
    """Branches execution: draft materials if matched, else record skip."""
    verdict = state.get("current_verdict")
    if verdict and verdict.match:
        return "enrich_and_draft"
    return "record_skip"


async def node_enrich_and_draft(state: PipelineGraphState) -> PipelineGraphState:
    """Enriches hiring contact and drafts tailored resume bullets & cover letter."""
    job = state["current_job"]
    if not job:
        return state

    trace = state.get("trace")
    usage = state.get("usage", {})

    with telemetry.trace_span(trace, name=f"Contact Lookup: {job.company}"):
        contact = await job_tools.find_hiring_contact(job.company, job.description, job.url)

    prompt = (
        f"CANDIDATE PROFILE\n{state['profile_block']}\n\n"
        + (f"{state['evidence_full']}\n\n" if state.get("evidence_full") else "")
        + f"JOB POSTING\n{_format_job_block(job)}"
    )

    with telemetry.trace_span(trace, name=f"Draft Materials: {job.title}"):
        drafted: DraftedMaterials = await _ask_agent(
            agent.drafter_agent,
            config.DRAFTER_MODEL,
            prompt,
            DraftedMaterials,
            usage,
            trace=trace,
            generation_name=f"Drafter: {job.title}",
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

    return {
        **state,
        "current_contact": contact,
        "current_drafted": drafted,
        "matched_count": state.get("matched_count", 0) + 1,
        "usage": usage,
    }


async def node_record_skip(state: PipelineGraphState) -> PipelineGraphState:
    """Records a non-matching verdict skip count."""
    return {
        **state,
        "skipped_count": state.get("skipped_count", 0) + 1,
    }


async def node_persist_and_advance(state: PipelineGraphState) -> PipelineGraphState:
    """Marks job seen in Firestore and advances pointer to next job."""
    job = state.get("current_job")
    verdict = state.get("current_verdict")
    evaluator = state.get("evaluator_fingerprint", "")
    if job and verdict:
        firestore_store.mark_job_seen(job.job_id, matched=verdict.match, evaluator=evaluator)

    return {
        **state,
        "current_index": state.get("current_index", 0) + 1,
        "current_job": None,
        "current_verdict": None,
        "current_contact": None,
        "current_drafted": None,
    }


def route_batch(state: PipelineGraphState) -> str:
    """Determines whether more jobs remain in the batch or to summarize."""
    idx = state.get("current_index", 0)
    jobs = state.get("jobs", [])
    if idx < len(jobs):
        return "evaluate_job"
    return "summarize_and_notify"


async def node_summarize_and_notify(state: PipelineGraphState) -> PipelineGraphState:
    """Summarizes token costs, records Langfuse evaluations, and sends email digest."""
    run_id = state["run_id"]
    usage = state.get("usage", {})
    trace = state.get("trace")

    total_cost, cost_by_model, tokens = pipeline_cost_summary(usage)
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

    apps = firestore_store.get_run_applications(run_id)
    notify.send_digest_email(
        matched=[a for a in apps if a.get("status") in ("matched", "drafted")],
        skipped=[a for a in apps if a.get("status") == "skipped"],
        run_id=run_id,
        summary=firestore_store.get_run_summary(run_id),
    )

    # Score trace in Langfuse
    if trace:
        telemetry.record_score(trace, "estimated_cost_usd", total_cost)
        telemetry.record_score(trace, "matched_count", float(state.get("matched_count", 0)))
        telemetry.flush()

    summary_result = {
        "run_id": run_id,
        "evaluated": len(state.get("jobs", [])),
        "matched": state.get("matched_count", 0),
        "skipped": state.get("skipped_count", 0),
        "tokens_by_model": usage,
        "cost_by_model": cost_by_model,
        "estimated_cost_usd": total_cost,
    }

    return {
        **state,
        "result_summary": summary_result,
    }


def pipeline_cost_summary(by_model: dict[str, dict[str, int]]) -> tuple[float, dict, dict]:
    """Helper to compute token and USD summary across models."""
    per_model_cost: dict[str, float] = {}
    combined = {"input": 0, "output": 0, "thoughts": 0, "total": 0}
    for model, tokens in by_model.items():
        billed_output = tokens["output"] + tokens["thoughts"]
        per_model_cost[model] = round(config.cost_usd(model, tokens["input"], billed_output), 4)
        for key in combined:
            combined[key] += tokens[key]
    return round(sum(per_model_cost.values()), 4), per_model_cost, combined


# -----------------------------------------------------------------------------
# Graph Construction & Compilation
# -----------------------------------------------------------------------------


def build_pipeline_graph() -> StateGraph:
    """Assembles and returns the LangGraph StateGraph workflow."""
    workflow = StateGraph(PipelineGraphState)

    workflow.add_node("ingest_and_prefilter", node_ingest_and_prefilter)
    workflow.add_node("evaluate_job", node_evaluate_job)
    workflow.add_node("enrich_and_draft", node_enrich_and_draft)
    workflow.add_node("record_skip", node_record_skip)
    workflow.add_node("persist_and_advance", node_persist_and_advance)
    workflow.add_node("summarize_and_notify", node_summarize_and_notify)

    workflow.add_edge(START, "ingest_and_prefilter")
    workflow.add_conditional_edges(
        "ingest_and_prefilter",
        route_batch,
        {
            "evaluate_job": "evaluate_job",
            "summarize_and_notify": "summarize_and_notify",
        },
    )

    workflow.add_conditional_edges(
        "evaluate_job",
        route_verdict,
        {
            "enrich_and_draft": "enrich_and_draft",
            "record_skip": "record_skip",
        },
    )

    workflow.add_edge("enrich_and_draft", "persist_and_advance")
    workflow.add_edge("record_skip", "persist_and_advance")

    workflow.add_conditional_edges(
        "persist_and_advance",
        route_batch,
        {
            "evaluate_job": "evaluate_job",
            "summarize_and_notify": "summarize_and_notify",
        },
    )

    workflow.add_edge("summarize_and_notify", END)

    return workflow


_compiled_graph = None


def get_compiled_graph():
    """Returns the compiled LangGraph pipeline runnable."""
    global _compiled_graph
    if _compiled_graph is None:
        workflow = build_pipeline_graph()
        _compiled_graph = workflow.compile()
    return _compiled_graph


async def run_langgraph_pipeline(
    run_id: str,
    max_jobs: int | None = None,
    registry_only: bool = False,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Runs one full pass of the pipeline using the compiled LangGraph state graph."""
    graph = get_compiled_graph()
    initial_state: PipelineGraphState = {
        "run_id": run_id,
        "user_id": user_id or config.USER_ID,
        "max_jobs": max_jobs,
        "registry_only": registry_only,
    }
    final_state = await graph.ainvoke(initial_state)
    return final_state.get("result_summary", {})
