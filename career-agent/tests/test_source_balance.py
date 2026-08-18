from __future__ import annotations

import pytest

from career_agent.models import JobListing
from career_agent.tools.job_tools import balanced_source_batch, coverage_balanced_batch
from career_agent.tools import job_tools


def job(source: str, index: int) -> JobListing:
    return JobListing(
        job_id=f"{source}:{index}",
        source=source,
        title="AI Engineer",
        company=f"Company {index}",
        location="Remote",
        remote=True,
        url=f"https://example.com/{source}/{index}",
        description="Build AI systems.",
    )


def test_balanced_batch_prevents_one_board_from_monopolizing_run():
    jobs = (
        [job("greenhouse:large-company", index) for index in range(6)]
        + [job("remotive", index) for index in range(2)]
        + [job("jobicy", index) for index in range(2)]
        + [job("ashby:startup", 0)]
    )

    selected = balanced_source_batch(jobs, 6)

    assert [item.source for item in selected] == [
        "greenhouse:large-company",
        "remotive",
        "jobicy",
        "ashby:startup",
        "greenhouse:large-company",
        "remotive",
    ]


def test_balanced_batch_uses_remaining_capacity_when_sources_are_small():
    jobs = [job("remotive", 0)] + [job("greenhouse:company", index) for index in range(5)]

    selected = balanced_source_batch(jobs, 4)

    assert len(selected) == 4
    assert [item.source for item in selected].count("remotive") == 1
    assert [item.source for item in selected].count("greenhouse:company") == 3


def test_balanced_batch_respects_zero_limit():
    assert balanced_source_batch([job("jobicy", 0)], 0) == []


def test_balanced_batch_prioritizes_newest_within_each_source():
    older = job("ashby:startup", 0)
    older.posted_at = "2026-08-10T10:00:00Z"
    newer = job("ashby:startup", 1)
    newer.posted_at = "2026-08-17T10:00:00Z"

    selected = balanced_source_batch([older, newer], 1)

    assert selected[0].job_id == newer.job_id


def test_coverage_batch_rotates_discovered_broad_and_configured_sources():
    jobs = (
        [job("ashby:startup", index) for index in range(3)]
        + [job("arbeitnow", index) for index in range(3)]
        + [job("ashby:openai", index) for index in range(6)]
    )

    selected = coverage_balanced_batch(jobs, 6, {"ashby:startup"})

    assert [item.source for item in selected] == [
        "ashby:startup", "arbeitnow", "ashby:openai",
        "ashby:startup", "arbeitnow", "ashby:openai",
    ]


@pytest.mark.asyncio
async def test_registry_only_fetches_discovered_boards_without_aggregators(monkeypatch):
    monkeypatch.setattr(
        job_tools.firestore_store,
        "get_active_board_registry",
        lambda: [{"provider": "ashby", "slug": "startup"}],
    )

    async def fetch(slug, client):
        return [job(f"ashby:{slug}", 0)]

    async def aggregator_must_not_run(client):
        raise AssertionError("aggregator ran during registry-only iteration")

    monkeypatch.setattr(job_tools.ats_boards, "fetch_ashby", fetch)
    monkeypatch.setattr(job_tools.aggregators, "fetch_arbeitnow", aggregator_must_not_run)

    jobs, errors = await job_tools._fetch_all_sources(registry_only=True)

    assert errors == {}
    assert [item.source for item in jobs] == ["ashby:startup"]


@pytest.mark.asyncio
async def test_configured_company_portal_is_fetched_and_accounted(monkeypatch):
    configured = {
        "provider": "feed", "slug": "acme", "company": "Acme",
        "url": "https://acme.example/jobs.xml", "careers_url": "https://acme.example",
    }
    monkeypatch.setattr(job_tools.config, "COMPANY_CAREER_PORTALS", [configured])
    monkeypatch.setattr(job_tools.firestore_store, "get_active_board_registry", lambda: [])
    for name in (
        "GREENHOUSE_BOARD_SLUGS", "LEVER_BOARD_SLUGS", "ASHBY_BOARD_SLUGS",
        "SMARTRECRUITERS_COMPANY_SLUGS",
    ):
        monkeypatch.setattr(job_tools.config, name, [])
    for name in ("ENABLE_ARBEITNOW", "ENABLE_REMOTIVE", "ENABLE_REMOTEOK", "ENABLE_JOBICY"):
        monkeypatch.setattr(job_tools.config, name, False)

    async def fetch(portal, client, detail_limit):
        return [job("feed:acme", 0)]

    monkeypatch.setattr(job_tools.company_portals, "fetch_portal", fetch)

    jobs, errors = await job_tools._fetch_all_sources()

    assert errors == {}
    assert any(item.source == "feed:acme" for item in jobs)
