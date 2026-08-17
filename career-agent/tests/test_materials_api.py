from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import main


RESUME = {
    "headline": "AI Engineer",
    "summary": "Builds grounded AI systems.",
    "skills": ["Python", "RAG"],
    "experience": [],
    "projects": [],
    "education": ["B.Tech"],
}


def application(**overrides):
    return {
        "job_id": "greenhouse:acme:123",
        "title": "AI Engineer",
        "company": "Acme",
        "cover_letter": "Generated letter",
        "tailored_resume": RESUME,
        **overrides,
    }


def test_materials_returns_generated_and_effective_edits(monkeypatch):
    edited_resume = {**RESUME, "headline": "Edited headline"}
    monkeypatch.setattr(
        main.firestore_store,
        "get_application",
        lambda _job_id: application(
            edited_cover_letter="Edited letter",
            edited_tailored_resume=edited_resume,
        ),
    )

    response = main.api_materials("greenhouse:acme:123")

    assert response["generated_cover_letter"] == "Generated letter"
    assert response["effective_cover_letter"] == "Edited letter"
    assert response["effective_tailored_resume"] == edited_resume


def test_save_cover_letter_keeps_generated_material_untouched(monkeypatch):
    saved = []
    monkeypatch.setattr(main.firestore_store, "get_application", lambda _job_id: application())
    monkeypatch.setattr(
        main.firestore_store,
        "save_material_edit",
        lambda job_id, material_type, value: saved.append((job_id, material_type, value)),
    )

    response = main.api_save_material(
        main.MaterialEditRequest(
            job_id="greenhouse:acme:123",
            material_type="cover_letter",
            cover_letter="  Human revision  ",
        )
    )

    assert response["edited"] is True
    assert saved == [("greenhouse:acme:123", "cover_letter", "Human revision")]


def test_reset_clears_only_the_selected_edit(monkeypatch):
    saved = []
    monkeypatch.setattr(main.firestore_store, "get_application", lambda _job_id: application())
    monkeypatch.setattr(
        main.firestore_store,
        "save_material_edit",
        lambda job_id, material_type, value: saved.append((job_id, material_type, value)),
    )

    response = main.api_save_material(
        main.MaterialEditRequest(
            job_id="greenhouse:acme:123",
            material_type="tailored_resume",
            reset=True,
        )
    )

    assert response["edited"] is False
    assert saved == [("greenhouse:acme:123", "tailored_resume", None)]


def test_empty_cover_letter_is_rejected(monkeypatch):
    monkeypatch.setattr(main.firestore_store, "get_application", lambda _job_id: application())

    with pytest.raises(HTTPException) as error:
        main.api_save_material(
            main.MaterialEditRequest(
                job_id="greenhouse:acme:123",
                material_type="cover_letter",
                cover_letter="   ",
            )
        )

    assert error.value.status_code == 400


def test_materials_requires_existing_generated_drafts(monkeypatch):
    monkeypatch.setattr(main.firestore_store, "get_application", lambda _job_id: {})

    with pytest.raises(HTTPException) as error:
        main.api_materials("missing")

    assert error.value.status_code == 404


def test_printable_resume_prefers_human_edit(monkeypatch):
    edited_resume = {**RESUME, "headline": "Human-edited headline"}
    monkeypatch.setattr(
        main.firestore_store,
        "get_application",
        lambda _job_id: application(edited_tailored_resume=edited_resume),
    )
    monkeypatch.setattr(
        main.config,
        "load_candidate_profile",
        lambda: SimpleNamespace(full_name="Naman", contact_line="naman@example.com"),
    )
    captured = {}

    def render(resume, **_kwargs):
        captured["resume"] = resume
        return "<html></html>"

    monkeypatch.setattr(main.resume_render, "render", render)

    main.tailored_resume("greenhouse:acme:123")

    assert captured["resume"] == edited_resume
