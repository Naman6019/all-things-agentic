"""LangGraph orchestration workflow for the TalentOS // Studio freelance pipeline.

Mirrors career_agent/graph.py but for freelance leads instead of job postings.
The same architectural tenets apply:

  1. The model is NOT the control flow -- fetch, dedupe, pre-filter, and notify
     are ordinary Python.
  2. Cheap filters before expensive evaluation -- drop leads with no relevant
     services before any model call.
  3. Per-lead isolated agent sessions -- constant token cost, no history
     accumulation.
  4. Human-in-the-loop -- the agent drafts the pitch and deep-links to the
     platform; the human sends. No auto-submission, ever.
"""
from __future__ import annotations

import uuid
from dataclasses import asdict
from typing import Annotated, Any, TypedDict

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from langgraph.graph import END, START, StateGraph

from . import agent, config, telemetry
from .graph import _accumulate_usage, _ask_agent, _build_profile_block, _fetch_public_work, pipeline_cost_summary
from .models import ClientLead, LeadEvaluation, PitchedMaterials
from .schemas import LeadVerdict, PitchDraft
from .sources import freelance_boards, profile_sources
from .storage import firestore_store
from .tools import notify

APP_NAME = "talentos-studio"


class FreelanceGraphState(TypedDict, total=False):
    run_id: str
    user_id: str
    max_leads: int | None
    evaluator_fingerprint: str
    profile_block: str
    evidence_brief: str
    evidence_full: str
    leads: list[ClientLead]
    current_index: int
    current_lead: ClientLead | None
    current_verdict: LeadVerdict | None
    current_pitch: PitchDraft | None
    matched_count: int
    skipped_count: int
    usage: dict[str, dict[str, int]]
    errors: dict[str, str]
    trace: Any
    result_summary: dict[str, Any]


def _format_lead_block(lead: ClientLead) -> str:
    return (
        f"title: {lead.title}\n"
        f"client: {lead.client}\n"
        f"budget: {lead.budget or 'not stated'}\n"
        f"timeline: {lead.timeline or 'not stated'}\n"
        f"url: {lead.url}\n"
        f"source: {lead.source}\n"
        f"description:\n{lead.description}"
    )


async def _collect_freelance_leads(run_id: str, max_leads: int | None = None) -> list[ClientLead]:
    """Fetch leads from all enabled freelance sources, dedupe against Firestore."""
    import httpx

    leads: list[ClientLead] = []
    async with httpx.AsyncClient() as client:
        if config.ENABLE_RFORHIRE:
            try:
                leads.extend(await freelance_boards.fetch_rforhire(client))
            except Exception as e:
                print(f"r/forhire fetch failed: {e}")
        if config.ENABLE_WWR_CONTRACT:
            try:
                leads.extend(await freelance_boards.fetch_wwr_contract(client))
            except Exception as e:
                print(f"WWR fetch failed: {e}")
        if config.ENABLE_CONTRA:
            try:
                leads.extend(await freelance_boards.fetch_contra(client))
            except Exception as e:
                print(f"Contra fetch failed: {e}")

    # Dedupe by lead_id, keeping the first occurrence.
    seen_ids: set[str] = set()
    unique: list[ClientLead] = []
    for lead in leads:
        if lead.lead_id not in seen_ids:
            seen_ids.add(lead.lead_id)
            unique.append(lead)

    # Drop leads already evaluated for this user.
    evaluator = config.evaluator_fingerprint()
    unseen = firestore_store.find_unseen_leads(unique, evaluator=evaluator)

    cap = max_leads or config.MAX_LEADS_PER_RUN
    return unseen[:cap]


# -----------------------------------------------------------------------------
# Graph Node Definitions
# -----------------------------------------------------------------------------


async def node_ingest_leads(state: FreelanceGraphState) -> FreelanceGraphState:
    """Fetch and pre-filter freelance leads across all enabled sources."""
    run_id = state["run_id"]
    trace = telemetry.create_pipeline_trace(run_id=run_id, user_id=state.get("user_id"))
    state["trace"] = trace

    with telemetry.trace_span(trace, name="Ingest Freelance Leads"):
        leads = await _collect_freelance_leads(run_id, max_leads=state.get("max_leads"))

        # Pre-filter: drop leads with empty descriptions (nothing for the
        # evaluator to reason about) or with titles shorter than 5 chars
        # (likely malformed RSS entries).
        pre_filtered: list[ClientLead] = []
        dropped_no_desc = 0
        dropped_short_title = 0
        for lead in leads:
            if not lead.description or len(lead.description.strip()) < 50:
                dropped_no_desc += 1
                continue
            if len(lead.title.strip()) < 5:
                dropped_short_title += 1
                continue
            pre_filtered.append(lead)

        profile_block = _build_profile_block()
        public_work = await _fetch_public_work() if pre_filtered else None
        evidence_brief = profile_sources.as_prompt_block(public_work, compact=True) if public_work else ""
        evidence_full = profile_sources.as_prompt_block(public_work) if public_work else ""

        state["leads"] = pre_filtered
        state["current_index"] = 0
        state["matched_count"] = 0
        state["skipped_count"] = 0
        state["usage"] = {}
        state["errors"] = {}
        state["profile_block"] = profile_block
        state["evidence_brief"] = evidence_brief
        state["evidence_full"] = evidence_full
        state["evaluator_fingerprint"] = config.evaluator_fingerprint()

        if dropped_no_desc or dropped_short_title:
            print(
                f"freelance pre-filter: {dropped_no_desc} dropped (no description), "
                f"{dropped_short_title} dropped (short title), "
                f"{len(pre_filtered)} remaining"
            )

    return state


def route_lead_batch(state: FreelanceGraphState) -> str:
    if state.get("current_index", 0) < len(state.get("leads", [])):
        return "evaluate_lead"
    return "summarize_and_notify"


async def node_evaluate_lead(state: FreelanceGraphState) -> FreelanceGraphState:
    """Evaluate the current lead against the freelancer's profile."""
    idx = state.get("current_index", 0)
    leads = state.get("leads", [])
    if idx >= len(leads):
        return state

    lead = leads[idx]
    state["current_lead"] = lead

    profile_block = state.get("profile_block", "")
    evidence_brief = state.get("evidence_brief", "")
    usage = state.get("usage", {})
    trace = state.get("trace")

    prompt = (
        f"FREELANCER PROFILE\n{profile_block}\n\n"
        + (f"{evidence_brief}\n\n" if evidence_brief else "")
        + f"FREELANCE LEAD\n{_format_lead_block(lead)}"
    )

    try:
        verdict: LeadVerdict = await _ask_agent(
            agent.freelance_evaluator_agent,
            config.FREELANCE_EVALUATOR_MODEL,
            prompt,
            LeadVerdict,
            usage,
            trace=trace,
            generation_name="Freelance Lead Evaluation",
        )
        state["current_verdict"] = verdict
    except Exception as e:
        state["errors"][lead.lead_id] = str(e)
        state["current_verdict"] = None

    return state


def route_lead_verdict(state: FreelanceGraphState) -> str:
    verdict = state.get("current_verdict")
    if verdict and verdict.match:
        return "draft_pitch"
    return "record_lead_skip"


async def node_draft_pitch(state: FreelanceGraphState) -> FreelanceGraphState:
    """Draft a pitch for a matched lead."""
    lead = state.get("current_lead")
    if not lead:
        return state

    profile_block = state.get("profile_block", "")
    evidence_full = state.get("evidence_full", "")
    usage = state.get("usage", {})
    trace = state.get("trace")

    prompt = (
        f"FREELANCER PROFILE\n{profile_block}\n\n"
        + (f"{evidence_full}\n\n" if evidence_full else "")
        + f"FREELANCE LEAD\n{_format_lead_block(lead)}"
    )

    try:
        pitch: PitchDraft = await _ask_agent(
            agent.freelance_pitcher_agent,
            config.FREELANCE_PITCHER_MODEL,
            prompt,
            PitchDraft,
            usage,
            trace=trace,
            generation_name="Freelance Pitch Draft",
        )
        state["current_pitch"] = pitch

        # Persist the matched lead and its pitch.
        firestore_store.save_lead_listing(lead)
        firestore_store.save_lead_evaluation(
            state["run_id"],
            LeadEvaluation(
                lead_id=lead.lead_id,
                match=True,
                unmet_requirements=[],
                missing_information=state["current_verdict"].missing_information if state.get("current_verdict") else [],
                reasoning=state["current_verdict"].reasoning if state.get("current_verdict") else "",
                match_strength=state["current_verdict"].match_strength if state.get("current_verdict") else "unscored",
            ),
        )
        firestore_store.save_pitched_materials(
            PitchedMaterials(
                lead_id=lead.lead_id,
                pitch_message=pitch.pitch_message,
                relevant_portfolio=pitch.relevant_portfolio,
                suggested_rate=pitch.suggested_rate,
                contact_method=pitch.contact_method,
            )
        )
        firestore_store.mark_lead_seen(lead.lead_id, matched=True, evaluator=state.get("evaluator_fingerprint", ""))

        state["matched_count"] = state.get("matched_count", 0) + 1
    except Exception as e:
        state["errors"][lead.lead_id] = str(e)

    return state


async def node_record_lead_skip(state: FreelanceGraphState) -> FreelanceGraphState:
    """Record a skipped lead with its specific unmet requirements."""
    lead = state.get("current_lead")
    if not lead:
        return state

    verdict = state.get("current_verdict")
    firestore_store.save_lead_evaluation(
        state["run_id"],
        LeadEvaluation(
            lead_id=lead.lead_id,
            match=False,
            unmet_requirements=verdict.unmet_requirements if verdict else [],
            missing_information=verdict.missing_information if verdict else [],
            reasoning=verdict.reasoning if verdict else "Evaluation failed",
            match_strength=verdict.match_strength if verdict else "unscored",
        ),
    )
    firestore_store.mark_lead_seen(lead.lead_id, matched=False, evaluator=state.get("evaluator_fingerprint", ""))

    state["skipped_count"] = state.get("skipped_count", 0) + 1
    return state


async def node_persist_and_advance(state: FreelanceGraphState) -> FreelanceGraphState:
    """Advance to the next lead."""
    state["current_index"] = state.get("current_index", 0) + 1
    state["current_lead"] = None
    state["current_verdict"] = None
    state["current_pitch"] = None
    return state


async def node_summarize_and_notify(state: FreelanceGraphState) -> FreelanceGraphState:
    """Summarize token costs, record Langfuse evaluations, and send digest."""
    run_id = state["run_id"]
    usage = state.get("usage", {})
    trace = state.get("trace")

    total_cost, cost_by_model, tokens = pipeline_cost_summary(usage)

    firestore_store.save_freelance_run_summary(
        run_id,
        {
            "tokens": tokens,
            "tokens_by_model": usage,
            "cost_by_model": cost_by_model,
            "cost_usd": total_cost,
            "models": {
                "evaluator": config.FREELANCE_EVALUATOR_MODEL,
                "pitcher": config.FREELANCE_PITCHER_MODEL,
            },
            "unpriced_models": sorted(m for m in usage if m not in config.MODEL_PRICES),
        },
    )

    leads = firestore_store.get_freelance_run_leads(run_id)
    notify.send_freelance_digest_email(
        matched=[l for l in leads if l.get("status") in ("matched", "pitched")],
        skipped=[l for l in leads if l.get("status") == "skipped"],
        run_id=run_id,
        summary=firestore_store.get_freelance_run_summary(run_id),
    )

    if trace:
        telemetry.record_score(trace, "estimated_cost_usd", total_cost)
        telemetry.record_score(trace, "matched_count", float(state.get("matched_count", 0)))
        telemetry.flush()

    summary_result = {
        "run_id": run_id,
        "evaluated": len(state.get("leads", [])),
        "matched": state.get("matched_count", 0),
        "skipped": state.get("skipped_count", 0),
        "tokens_by_model": usage,
        "cost_by_model": cost_by_model,
        "estimated_cost_usd": total_cost,
    }

    return {**state, "result_summary": summary_result}


# -----------------------------------------------------------------------------
# Graph Construction & Compilation
# -----------------------------------------------------------------------------


def build_freelance_pipeline_graph() -> StateGraph:
    """Assembles and returns the LangGraph StateGraph for the freelance pipeline."""
    workflow = StateGraph(FreelanceGraphState)

    workflow.add_node("ingest_leads", node_ingest_leads)
    workflow.add_node("evaluate_lead", node_evaluate_lead)
    workflow.add_node("draft_pitch", node_draft_pitch)
    workflow.add_node("record_lead_skip", node_record_lead_skip)
    workflow.add_node("persist_and_advance", node_persist_and_advance)
    workflow.add_node("summarize_and_notify", node_summarize_and_notify)

    workflow.add_edge(START, "ingest_leads")
    workflow.add_conditional_edges(
        "ingest_leads",
        route_lead_batch,
        {
            "evaluate_lead": "evaluate_lead",
            "summarize_and_notify": "summarize_and_notify",
        },
    )
    workflow.add_conditional_edges(
        "evaluate_lead",
        route_lead_verdict,
        {
            "draft_pitch": "draft_pitch",
            "record_lead_skip": "record_lead_skip",
        },
    )
    workflow.add_edge("draft_pitch", "persist_and_advance")
    workflow.add_edge("record_lead_skip", "persist_and_advance")
    workflow.add_conditional_edges(
        "persist_and_advance",
        route_lead_batch,
        {
            "evaluate_lead": "evaluate_lead",
            "summarize_and_notify": "summarize_and_notify",
        },
    )
    workflow.add_edge("summarize_and_notify", END)

    return workflow


_compiled_freelance_graph = None


def get_compiled_freelance_graph():
    """Returns the compiled freelance LangGraph pipeline runnable."""
    global _compiled_freelance_graph
    if _compiled_freelance_graph is None:
        workflow = build_freelance_pipeline_graph()
        _compiled_freelance_graph = workflow.compile()
    return _compiled_freelance_graph


async def run_freelance_pipeline(
    run_id: str,
    max_leads: int | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Runs one full pass of the freelance pipeline."""
    graph = get_compiled_freelance_graph()
    initial_state: FreelanceGraphState = {
        "run_id": run_id,
        "user_id": user_id or config.USER_ID,
        "max_leads": max_leads,
    }
    final_state = await graph.ainvoke(initial_state)
    return final_state.get("result_summary", {})