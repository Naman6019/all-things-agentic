from __future__ import annotations

from career_agent.review_groups import group_applications, normalized_company, normalized_title


def _application(job_id: str, *, company: str, title: str, location: str, url: str) -> dict:
    return {
        "job_id": job_id,
        "company": company,
        "title": title,
        "location": location,
        "url": url,
        "source": job_id.split(":", 1)[0],
        "status": "matched",
    }


def test_normalizes_company_and_title_presentation():
    assert normalized_company(" Acme, Inc. ") == normalized_company("ACME")
    assert normalized_company("Smith & Jones LLC") == normalized_company("Smith and Jones")
    assert normalized_title("Machine-Learning   Engineer") == normalized_title("machine learning engineer")


def test_groups_duplicates_and_preserves_every_location_and_link():
    applications = [
        _application(
            "greenhouse:acme:1", company="Acme, Inc.", title="ML Engineer",
            location="Bengaluru", url="https://example.com/jobs/1",
        ),
        _application(
            "lever:acme:2", company="ACME", title="ML-Engineer",
            location="Remote - India", url="https://example.com/jobs/2",
        ),
    ]

    groups = group_applications(applications)

    assert len(groups) == 1
    assert groups[0]["posting_count"] == 2
    assert [(p["location"], p["url"]) for p in groups[0]["postings"]] == [
        ("Bengaluru", "https://example.com/jobs/1"),
        ("Remote - India", "https://example.com/jobs/2"),
    ]


def test_does_not_group_distinct_titles_or_missing_identity():
    applications = [
        _application("a:1", company="Acme", title="ML Engineer", location="A", url="https://a"),
        _application("a:2", company="Acme", title="Data Engineer", location="B", url="https://b"),
        _application("a:3", company="", title="", location="C", url="https://c"),
        _application("a:4", company="", title="", location="D", url="https://d"),
    ]

    assert len(group_applications(applications)) == 4
