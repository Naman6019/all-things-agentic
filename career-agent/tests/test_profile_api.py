from __future__ import annotations

import pytest
from fastapi import HTTPException

import main
from career_agent.models import CandidateProfile


def profile(**overrides) -> CandidateProfile:
    data = dict(
        target_titles=["AI Engineer"],
        must_have_skills=["Python"],
        min_years_experience=1,
        remote_only=False,
        allowed_locations=["Remote", "India", "Bengaluru", "Mumbai", "Kolkata", "Pune"],
        min_salary=800000,
        min_salary_currency="INR",
        needs_visa_sponsorship=True,
        resume_master_text="Do not overwrite this resume.",
    )
    data.update(overrides)
    return CandidateProfile(**data)


def test_get_profile_normalizes_legacy_locations_to_five(monkeypatch):
    monkeypatch.setattr(main.config, "load_candidate_profile", lambda: profile())

    result = main.api_profile()

    assert result["location_preferences"][0] == {"location": "Worldwide", "work_mode": "remote"}
    assert len(result["location_preferences"]) == 5


def test_save_preferences_preserves_resume_and_other_profile_fields(monkeypatch):
    current = profile()
    saved = []
    monkeypatch.setattr(main.config, "load_candidate_profile", lambda: current)
    monkeypatch.setattr(main.config, "invalidate_profile_cache", lambda: None)
    monkeypatch.setattr(main.firestore_store, "get_profile", lambda: current.__dict__.copy())
    monkeypatch.setattr(main.firestore_store, "save_profile", lambda value: saved.append(value))

    result = main.api_save_profile(main.SearchPreferencesRequest(
        target_titles=["AI Engineer", " Backend Engineer ", "AI Engineer"],
        location_preferences=[
            main.LocationPreferenceRequest(location="Worldwide", work_mode="remote"),
            main.LocationPreferenceRequest(location="Bengaluru, India", work_mode="both"),
        ],
        needs_visa_sponsorship=False,
    ))

    assert result["target_titles"] == ["AI Engineer", "Backend Engineer"]
    assert saved[0]["resume_master_text"] == "Do not overwrite this resume."
    assert saved[0]["allowed_locations"] == ["Worldwide", "Bengaluru, India"]
    assert saved[0]["remote_only"] is False


def test_save_rejects_more_than_five_locations():
    payload = main.SearchPreferencesRequest(
        target_titles=["AI Engineer"],
        location_preferences=[
            main.LocationPreferenceRequest(location=f"Place {index}", work_mode="both")
            for index in range(6)
        ],
        needs_visa_sponsorship=False,
    )

    with pytest.raises(HTTPException) as error:
        main.api_save_profile(payload)

    assert error.value.status_code == 400
    assert "up to 5" in error.value.detail


class _FakeRequest:
    """Just enough Request for the form handler; Starlette's needs an ASGI scope."""

    def __init__(self, form: dict[str, str]) -> None:
        self._form = form

    async def form(self):
        return self._form


@pytest.mark.asyncio
async def test_legacy_form_edit_to_locations_is_not_overruled_by_stale_preferences(monkeypatch):
    """Regression: /profile could not actually change where the agent searched.

    The form writes allowed_locations, the agent reads location_preferences,
    and the merge preserved the latter -- so editing locations here saved
    cleanly, redirected to ?saved=1, and changed nothing.
    """
    stored = {
        "resume_master_text": "Do not overwrite this resume.",
        "allowed_locations": ["Bengaluru", "London"],
        "location_preferences": [
            {"location": "Bengaluru", "work_mode": "onsite"},
            {"location": "London", "work_mode": "both"},
        ],
    }
    saved: list[dict] = []
    monkeypatch.setattr(main.firestore_store, "get_profile", lambda: dict(stored))
    monkeypatch.setattr(main.firestore_store, "save_profile", lambda value: saved.append(value))
    monkeypatch.setattr(main.config, "invalidate_profile_cache", lambda: None)

    response = await main.save_profile(_FakeRequest({
        "target_titles": "AI Engineer",
        "resume_master_text": "Do not overwrite this resume.",
        "allowed_locations": "Bengaluru\nKolkata",
    }))

    assert response.status_code == 303
    assert saved[0]["allowed_locations"] == ["Bengaluru", "Kolkata"]
    # Bengaluru keeps the on-site mode chosen on the settings page; London is
    # gone because the human removed it; Kolkata arrives with the default.
    assert saved[0]["location_preferences"] == [
        {"location": "Bengaluru", "work_mode": "onsite"},
        {"location": "Kolkata", "work_mode": "both"},
    ]
    assert saved[0]["resume_master_text"] == "Do not overwrite this resume."


def test_legacy_form_maps_bare_remote_to_worldwide():
    assert main.matching.preferences_from_allowed_locations(["Remote", "Pune"]) == [
        {"location": "Worldwide", "work_mode": "remote"},
        {"location": "Pune", "work_mode": "both"},
    ]


def test_both_profile_editors_normalize_scope_identically(monkeypatch):
    """The settings page and the agent must not disagree about saved scope."""
    monkeypatch.setattr(main.config, "load_candidate_profile", lambda: profile(
        location_preferences=[
            {"location": "Kolkata, India", "work_mode": "both"},
            {"location": "Kolkata, India", "work_mode": "both"},   # duplicate
            {"location": "", "work_mode": "remote"},                # malformed
            {"location": "Worldwide", "work_mode": "remote"},
        ],
    ))

    from career_agent import matching

    served = main.api_profile()["location_preferences"]
    read_by_agent = matching.normalized_location_preferences(main.config.load_candidate_profile())

    assert served == read_by_agent
    assert served == [
        {"location": "Kolkata, India", "work_mode": "both"},
        {"location": "Worldwide", "work_mode": "remote"},
    ]
