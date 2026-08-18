from __future__ import annotations

import pytest
from fastapi import HTTPException

import main


def _record_status_writes(monkeypatch, applications: list[dict]) -> list[tuple[str, str]]:
    recorded: list[tuple[str, str]] = []
    monkeypatch.setattr(
        main.firestore_store,
        "set_application_status",
        lambda job_id, status: recorded.append((job_id, status)),
    )
    monkeypatch.setattr(
        main.firestore_store, "get_applications_by_status", lambda statuses: applications
    )
    return recorded


def test_json_status_endpoint_updates_application(monkeypatch):
    recorded = _record_status_writes(monkeypatch, [
        {"job_id": "greenhouse:acme:123", "company": "Acme", "title": "ML Engineer", "status": "matched"},
    ])

    response = main.api_application_status(
        main.ApplicationStatusRequest(job_id="greenhouse:acme:123", status="applied")
    )

    assert response == {
        "job_id": "greenhouse:acme:123",
        "job_ids": ["greenhouse:acme:123"],
        "status": "applied",
    }
    assert recorded == [("greenhouse:acme:123", "applied")]


def test_status_change_covers_every_posting_on_the_grouped_card(monkeypatch):
    """One card is several documents; a half-update leaves duplicates behind.

    Marking the card applied and then re-reading "to apply" used to regroup the
    untouched siblings into the very card the human had just cleared.
    """
    recorded = _record_status_writes(monkeypatch, [
        {"job_id": "one", "company": "Acme, Inc.", "title": "ML Engineer", "location": "Pune", "status": "matched"},
        {"job_id": "two", "company": "ACME", "title": "ML-Engineer", "location": "Remote", "status": "drafted"},
        {"job_id": "three", "company": "Acme", "title": "Data Engineer", "location": "Pune", "status": "matched"},
    ])

    response = main.api_application_status(
        main.ApplicationStatusRequest(job_id="one", status="applied")
    )

    assert response["job_ids"] == ["one", "two"]
    assert recorded == [("one", "applied"), ("two", "applied")]


def test_status_change_leaves_unrelated_roles_alone(monkeypatch):
    recorded = _record_status_writes(monkeypatch, [
        {"job_id": "one", "company": "Acme", "title": "ML Engineer", "status": "matched"},
        {"job_id": "three", "company": "Acme", "title": "Data Engineer", "status": "matched"},
    ])

    main.api_application_status(main.ApplicationStatusRequest(job_id="three", status="applied"))

    assert recorded == [("three", "applied")]


def test_html_status_form_also_updates_the_whole_group(monkeypatch):
    recorded = _record_status_writes(monkeypatch, [
        {"job_id": "one", "company": "Acme", "title": "ML Engineer", "location": "Pune", "status": "applied"},
        {"job_id": "two", "company": "Acme", "title": "ML Engineer", "location": "Remote", "status": "applied"},
    ])

    main.set_status(job_id="two", status="drafted")

    assert recorded == [("one", "drafted"), ("two", "drafted")]


def test_json_status_endpoint_rejects_unknown_status():
    with pytest.raises(HTTPException) as error:
        main.api_application_status(
            main.ApplicationStatusRequest(job_id="greenhouse:acme:123", status="rejected")
        )

    assert error.value.status_code == 400


def test_jobs_endpoint_returns_grouped_postings(monkeypatch):
    monkeypatch.setattr(
        main.firestore_store,
        "get_applications_by_status",
        lambda statuses: [
            {"job_id": "one", "company": "Acme, Inc.", "title": "ML Engineer", "location": "Pune", "url": "https://one"},
            {"job_id": "two", "company": "ACME", "title": "ML-Engineer", "location": "Remote", "url": "https://two"},
        ],
    )

    response = main.api_jobs("matched")

    assert response["status"] == "matched"
    assert len(response["jobs"]) == 1
    assert [posting["url"] for posting in response["jobs"][0]["postings"]] == ["https://one", "https://two"]
