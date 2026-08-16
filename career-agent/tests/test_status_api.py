from __future__ import annotations

import pytest
from fastapi import HTTPException

import main


def test_json_status_endpoint_updates_application(monkeypatch):
    recorded: list[tuple[str, str]] = []
    monkeypatch.setattr(
        main.firestore_store,
        "set_application_status",
        lambda job_id, status: recorded.append((job_id, status)),
    )

    response = main.api_application_status(
        main.ApplicationStatusRequest(job_id="greenhouse:acme:123", status="applied")
    )

    assert response == {"job_id": "greenhouse:acme:123", "status": "applied"}
    assert recorded == [("greenhouse:acme:123", "applied")]


def test_json_status_endpoint_rejects_unknown_status():
    with pytest.raises(HTTPException) as error:
        main.api_application_status(
            main.ApplicationStatusRequest(job_id="greenhouse:acme:123", status="rejected")
        )

    assert error.value.status_code == 400
