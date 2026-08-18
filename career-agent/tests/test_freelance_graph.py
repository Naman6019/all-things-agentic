"""Tests for LangGraph StateGraph freelance pipeline orchestration (TalentOS // Studio)."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from career_agent import freelance_graph
from career_agent.models import ClientLead, LeadEvaluation, PitchedMaterials
from career_agent.schemas import LeadVerdict, PitchDraft


def test_build_freelance_pipeline_graph_structure():
    workflow = freelance_graph.build_freelance_pipeline_graph()
    assert workflow is not None

    compiled = workflow.compile()
    assert compiled is not None


def test_route_lead_verdict():
    # Matched verdict routes to draft_pitch
    state_matched = {
        "current_verdict": LeadVerdict(
            match=True,
            match_strength="strong",
            unmet_requirements=[],
            missing_information=[],
            reasoning="Strong match for Next.js agent system",
        )
    }
    assert freelance_graph.route_lead_verdict(state_matched) == "draft_pitch"

    # Unmatched verdict routes to record_lead_skip
    state_unmatched = {
        "current_verdict": LeadVerdict(
            match=False,
            match_strength="weak",
            unmet_requirements=["Requires PHP/Wordpress"],
            missing_information=[],
            reasoning="Tech stack mismatch",
        )
    }
    assert freelance_graph.route_lead_verdict(state_unmatched) == "record_lead_skip"

    # None verdict routes to record_lead_skip
    assert freelance_graph.route_lead_verdict({}) == "record_lead_skip"


def test_route_lead_batch():
    dummy_lead = ClientLead(
        lead_id="contra:test:1",
        source="contra",
        title="AI Engineer needed",
        client="Startup X",
        budget="$3,000",
        timeline="2 weeks",
        url="https://contra.com/p/1",
        description="Build an autonomous agent pipeline with LangGraph.",
        posted_at="2026-08-18",
    )
    # When current_index < len(leads), route to evaluate_lead
    state_more = {"current_index": 0, "leads": [dummy_lead]}
    assert freelance_graph.route_lead_batch(state_more) == "evaluate_lead"

    # When current_index >= len(leads), route to summarize_and_notify
    state_done = {"current_index": 1, "leads": [dummy_lead]}
    assert freelance_graph.route_lead_batch(state_done) == "summarize_and_notify"


def test_format_lead_block():
    lead = ClientLead(
        lead_id="rforhire:test:123",
        source="r/forhire",
        title="[Hiring] Next.js Full Stack Developer",
        client="reddit_user",
        budget="$50/hr",
        timeline="Immediate",
        url="https://reddit.com/r/forhire/123",
        description="Looking for an experienced Next.js and Firebase developer.",
        posted_at="2026-08-18",
    )
    formatted = freelance_graph._format_lead_block(lead)
    assert "[Hiring] Next.js Full Stack Developer" in formatted
    assert "reddit_user" in formatted
    assert "$50/hr" in formatted
    assert "Immediate" in formatted
    assert "https://reddit.com/r/forhire/123" in formatted
    assert "Looking for an experienced Next.js" in formatted


@pytest.mark.asyncio
async def test_node_persist_and_advance():
    lead = ClientLead(
        lead_id="wwr:1",
        source="wwr",
        title="Lead 1",
        client="Client 1",
        budget="$2,000",
        timeline="1 month",
        url="https://weworkremotely.com/1",
        description="Desc",
        posted_at="2026-08-18",
    )
    state = {
        "current_index": 0,
        "current_lead": lead,
        "current_verdict": LeadVerdict(
            match=True,
            match_strength="strong",
            unmet_requirements=[],
            missing_information=[],
            reasoning="Good",
        ),
        "current_pitch": PitchDraft(
            pitch_message="Hello",
            relevant_portfolio=["https://github.com/example/repo"],
            suggested_rate="$50/hr",
            contact_method="email",
        ),
    }

    advanced = await freelance_graph.node_persist_and_advance(state)
    assert advanced["current_index"] == 1
    assert advanced["current_lead"] is None
    assert advanced["current_verdict"] is None
    assert advanced["current_pitch"] is None


@pytest.mark.asyncio
async def test_node_record_lead_skip(monkeypatch):
    saved_evaluations = []
    seen_markers = []

    monkeypatch.setattr(
        freelance_graph.firestore_store,
        "save_lead_evaluation",
        lambda run_id, eval_obj: saved_evaluations.append((run_id, eval_obj)),
    )
    monkeypatch.setattr(
        freelance_graph.firestore_store,
        "mark_lead_seen",
        lambda lead_id, matched, evaluator: seen_markers.append((lead_id, matched, evaluator)),
    )

    lead = ClientLead(
        lead_id="contra:skip:1",
        source="contra",
        title="WordPress Dev",
        client="Shopify Store",
        budget="$500",
        timeline="1 week",
        url="https://contra.com/p/skip",
        description="WordPress theme modification",
        posted_at="2026-08-18",
    )
    verdict = LeadVerdict(
        match=False,
        match_strength="weak",
        unmet_requirements=["Requires WordPress"],
        missing_information=[],
        reasoning="Tech mismatch",
    )

    state = {
        "run_id": "run-test-123",
        "current_lead": lead,
        "current_verdict": verdict,
        "evaluator_fingerprint": "fingerprint-abc",
        "skipped_count": 0,
    }

    result = await freelance_graph.node_record_lead_skip(state)
    assert result["skipped_count"] == 1
    assert len(saved_evaluations) == 1
    assert saved_evaluations[0][0] == "run-test-123"
    assert saved_evaluations[0][1].match is False
    assert saved_evaluations[0][1].unmet_requirements == ["Requires WordPress"]

    assert len(seen_markers) == 1
    assert seen_markers[0] == ("contra:skip:1", False, "fingerprint-abc")
