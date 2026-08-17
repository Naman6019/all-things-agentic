"""Tests for LangGraph StateGraph pipeline orchestration."""
import pytest
from unittest.mock import AsyncMock, patch
from career_agent import graph
from career_agent.models import JobListing
from career_agent.schemas import DraftedMaterials, JobVerdict, TailoredResume


def test_build_pipeline_graph_structure():
    workflow = graph.build_pipeline_graph()
    assert workflow is not None

    compiled = workflow.compile()
    assert compiled is not None


def test_route_verdict():
    # Matched verdict routes to enrich_and_draft
    state_matched = {
        "current_verdict": JobVerdict(
            match=True,
            match_strength="strong",
            unmet_requirements=[],
            missing_information=[],
            reasoning="Good match",
        )
    }
    assert graph.route_verdict(state_matched) == "enrich_and_draft"

    # Unmatched verdict routes to record_skip
    state_unmatched = {
        "current_verdict": JobVerdict(
            match=False,
            match_strength="weak",
            unmet_requirements=["Requires 8+ yrs"],
            missing_information=[],
            reasoning="Seniority mismatch",
        )
    }
    assert graph.route_verdict(state_unmatched) == "record_skip"


def test_route_batch():
    dummy_job = JobListing(
        job_id="ashby:test:1",
        source="ashby:test",
        title="AI Engineer",
        company="test",
        location="Remote",
        remote=True,
        url="https://example.com/1",
        description="desc",
        posted_at=None,
    )
    # When current_index < len(jobs), should evaluate next job
    state_more = {"current_index": 0, "jobs": [dummy_job]}
    assert graph.route_batch(state_more) == "evaluate_job"

    # When current_index >= len(jobs), should summarize and notify
    state_done = {"current_index": 1, "jobs": [dummy_job]}
    assert graph.route_batch(state_done) == "summarize_and_notify"


def test_pipeline_cost_summary():
    usage = {
        "gemini-3.6-flash": {"input": 1_000_000, "output": 100_000, "thoughts": 50_000, "total": 1_150_000}
    }
    total_cost, cost_by_model, combined = graph.pipeline_cost_summary(usage)
    # gemini-3.6-flash rate: (1.50 in, 7.50 out) -> 1.50 + (0.15 * 7.50) = 1.50 + 1.125 = 2.625 -> 2.625
    assert total_cost == 2.625
    assert cost_by_model["gemini-3.6-flash"] == 2.625
    assert combined["input"] == 1_000_000
    assert combined["output"] == 100_000
    assert combined["thoughts"] == 50_000
