from __future__ import annotations

import httpx
import pytest

from career_agent import board_scout
from career_agent.board_scout import BoardCandidate


def candidate(provider: str, slug: str, company: str = "Acme") -> BoardCandidate:
    return BoardCandidate(provider=provider, slug=slug, company=company)


def test_normalize_candidates_allowlists_and_deduplicates():
    result = board_scout.normalize_candidates(
        [
            candidate("Ashby", "startup-one"),
            candidate("ashby", "startup-one"),
            candidate("linkedin", "not-allowed"),
            candidate("lever", "bad/slug"),
            candidate("greenhouse", "valid_board"),
        ],
        limit=5,
    )

    assert [(item.provider, item.slug) for item in result] == [
        ("ashby", "startup-one"),
        ("greenhouse", "valid_board"),
    ]


def test_normalize_candidates_accepts_safe_public_company_portals_only():
    result = board_scout.normalize_candidates(
        [
            BoardCandidate(provider="workable", slug="acme", company="Acme"),
            BoardCandidate(provider="oracle", slug="bigco", company="Big Co", careers_url="https://jobs.bigco.example/sitemap.xml"),
            BoardCandidate(provider="workday", slug="unsafe", company="Unsafe", careers_url="https://127.0.0.1/wday/cxs/x/y"),
            BoardCandidate(provider="feed", slug="no-url", company="Missing"),
        ],
        limit=5,
    )

    assert [(item.provider, item.slug) for item in result] == [
        ("workable", "acme"),
        ("oracle", "bigco"),
    ]


def test_parse_candidate_response_handles_fenced_grounded_output():
    text = '''Here are the results.\n```json\n{"boards":[{"provider":"lever","slug":"small-co","company":"Small Co","careers_url":"https://jobs.lever.co/small-co"}]}\n```'''

    result = board_scout.parse_candidate_response(text, limit=3)

    assert [(item.provider, item.slug) for item in result] == [("lever", "small-co")]


def test_parse_candidate_response_recovers_complete_items_from_truncation():
    text = '''```json\n{"boards":[{"provider":"ashby","slug":"one","company":"One","careers_url":"https://jobs.ashbyhq.com/one"},{"provider":"lever","slug":"two","company":"Two","careers_url":"https://jobs.lever.co/two"},{"provider":"greenhouse","slug":"cut'''

    result = board_scout.parse_candidate_response(text, limit=3)

    assert [(item.provider, item.slug) for item in result] == [("ashby", "one"), ("lever", "two")]


@pytest.mark.asyncio
async def test_validate_candidate_requires_live_jobs(monkeypatch):
    async def empty_board(slug, client):
        return []

    monkeypatch.setattr(board_scout.ats_boards, "fetch_ashby", empty_board)
    async with httpx.AsyncClient() as client:
        result = await board_scout.validate_candidate(candidate("ashby", "empty"), client)

    assert result["valid"] is False
    assert result["job_count"] == 0


@pytest.mark.asyncio
async def test_run_persists_only_validated_boards(monkeypatch):
    proposed = [candidate("ashby", "good"), candidate("lever", "dead")]
    saved = []

    async def discover(limit):
        return proposed, {"model": "test", "search_queries": ["one query"]}

    async def validate(board, client):
        return {**board.model_dump(), "valid": board.slug == "good", "job_count": 3 if board.slug == "good" else 0, "error": ""}

    monkeypatch.setattr(board_scout, "discover_candidates", discover)
    monkeypatch.setattr(board_scout, "validate_candidate", validate)
    monkeypatch.setattr(board_scout.firestore_store, "upsert_board_registry", lambda board, run_id: saved.append(board))
    monkeypatch.setattr(board_scout.firestore_store, "save_board_discovery_run", lambda run_id, result: None)

    result = await board_scout.run_once(max_candidates=2)

    assert result["validated"] == 1
    assert [board["slug"] for board in saved] == ["good"]
