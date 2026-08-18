"""Tests for TalentOS // Studio Freelance FastAPI endpoints."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

import main


LEAD_DOC = {
    "lead_id": "rforhire:post:456",
    "title": "Need Next.js & Python Agent Developer",
    "client": "FoundersLab",
    "budget": "$4,000",
    "timeline": "3 weeks",
    "url": "https://reddit.com/r/forhire/comments/456",
    "source": "r/forhire",
    "description": "Looking for an autonomous agent developer...",
    "status": "matched",
    "pitch_message": "Hi, I specialize in Next.js and LangGraph agents...",
    "relevant_portfolio": "Built TalentOS autonomous pipeline.",
    "suggested_rate": "$65/hr",
    "contact_method": "Reddit DM",
}


def test_api_leads_returns_leads_by_status(monkeypatch):
    monkeypatch.setattr(
        main.firestore_store,
        "get_leads_by_status",
        lambda statuses: [LEAD_DOC],
    )

    response = main.api_leads(status="matched")
    assert response["status"] == "matched"
    assert len(response["leads"]) == 1
    assert response["leads"][0]["lead_id"] == "rforhire:post:456"


def test_api_lead_by_id_returns_lead_or_404(monkeypatch):
    monkeypatch.setattr(
        main.firestore_store,
        "get_lead",
        lambda lead_id: LEAD_DOC if lead_id == "rforhire:post:456" else None,
    )

    # Found
    lead = main.api_lead("rforhire:post:456")
    assert lead["client"] == "FoundersLab"

    # Not found
    with pytest.raises(HTTPException) as err:
        main.api_lead("missing-id")
    assert err.value.status_code == 404


def test_api_lead_status_updates(monkeypatch):
    updated = []
    monkeypatch.setattr(
        main.firestore_store,
        "set_lead_status",
        lambda lead_id, status: updated.append((lead_id, status)),
    )

    res = main.api_lead_status("rforhire:post:456", status="sent")
    assert res == {"lead_id": "rforhire:post:456", "status": "sent"}
    assert updated == [("rforhire:post:456", "sent")]

    # Invalid status raises 400
    with pytest.raises(HTTPException) as err:
        main.api_lead_status("rforhire:post:456", status="invalid_status")
    assert err.value.status_code == 400


def test_api_save_pitch_edit_and_reset(monkeypatch):
    saved_edits = []
    monkeypatch.setattr(
        main.firestore_store,
        "get_lead",
        lambda lead_id: LEAD_DOC if lead_id == "rforhire:post:456" else None,
    )
    monkeypatch.setattr(
        main.firestore_store,
        "save_pitch_edit",
        lambda lead_id, msg: saved_edits.append((lead_id, msg)),
    )

    # Edit pitch
    res = main.api_save_pitch(
        main.PitchEditRequest(
            lead_id="rforhire:post:456",
            pitch_message="  Custom human pitch message  ",
        )
    )
    assert res["edited"] is True
    assert saved_edits[-1] == ("rforhire:post:456", "Custom human pitch message")

    # Reset pitch
    res_reset = main.api_save_pitch(
        main.PitchEditRequest(
            lead_id="rforhire:post:456",
            reset=True,
        )
    )
    assert res_reset["edited"] is False
    assert saved_edits[-1] == ("rforhire:post:456", None)

    # Empty pitch raises 400
    with pytest.raises(HTTPException) as err_empty:
        main.api_save_pitch(
            main.PitchEditRequest(
                lead_id="rforhire:post:456",
                pitch_message="   ",
            )
        )
    assert err_empty.value.status_code == 400

    # Missing lead raises 404
    with pytest.raises(HTTPException) as err_missing:
        main.api_save_pitch(
            main.PitchEditRequest(
                lead_id="nonexistent-lead",
                pitch_message="Hello",
            )
        )
    assert err_missing.value.status_code == 404


def test_api_freelance_profile_get_and_put(monkeypatch):
    profile_data = {
        "full_name": "Naman",
        "contact_line": "naman@example.com",
        "target_titles": ["AI Engineer"],
        "must_have_skills": ["Python"],
        "min_years_experience": 2,
        "remote_only": False,
        "allowed_locations": ["Remote"],
        "min_salary": 100000,
        "min_salary_currency": "USD",
        "needs_visa_sponsorship": False,
        "resume_master_text": "Master resume content.",
        "freelance_niche": "Autonomous Agent Pipelines",
        "freelance_availability": "20 hrs/week",
        "freelance_services": ["LangGraph", "FastAPI"],
        "freelance_portfolio_summary": "Built TalentOS.",
    }

    monkeypatch.setattr(
        main.config,
        "load_candidate_profile",
        lambda: SimpleNamespace(**profile_data),
    )
    saved_profiles = []
    monkeypatch.setattr(
        main.firestore_store,
        "get_profile",
        lambda: profile_data,
    )
    monkeypatch.setattr(
        main.firestore_store,
        "save_profile",
        lambda p: saved_profiles.append(p),
    )
    monkeypatch.setattr(
        main.config,
        "invalidate_profile_cache",
        lambda: None,
    )

    # GET
    res_get = main.api_freelance_profile()
    assert res_get["freelance_niche"] == "Autonomous Agent Pipelines"
    assert res_get["freelance_services"] == ["LangGraph", "FastAPI"]

    # PUT
    res_put = main.api_save_freelance_profile(
        main.FreelanceProfileRequest(
            freelance_niche="Full Stack Agent Systems",
            freelance_availability="15 hrs/week",
            freelance_services=["Next.js", "Python ADK"],
            freelance_portfolio_summary="Shipped multiple client AI apps.",
        )
    )
    assert res_put["freelance_niche"] == "Full Stack Agent Systems"
    assert res_put["freelance_services"] == ["Next.js", "Python ADK"]
    assert len(saved_profiles) == 1
    assert saved_profiles[0]["freelance_niche"] == "Full Stack Agent Systems"


@pytest.mark.asyncio
async def test_run_freelance_pipeline_endpoint(monkeypatch):
    run_called = []

    async def mock_run_freelance_pipeline(run_id, max_leads=None):
        run_called.append((run_id, max_leads))
        return {"run_id": run_id, "evaluated": 5, "matched": 2}

    monkeypatch.setattr(
        main.freelance_graph,
        "run_freelance_pipeline",
        mock_run_freelance_pipeline,
    )

    result = await main.run_freelance_pipeline_endpoint(max_leads=5)
    assert result["matched"] == 2
    assert len(run_called) == 1
    assert run_called[0][1] == 5

    # Invalid max_leads raises 400
    with pytest.raises(HTTPException) as err:
        await main.run_freelance_pipeline_endpoint(max_leads=9999)
    assert err.value.status_code == 400
