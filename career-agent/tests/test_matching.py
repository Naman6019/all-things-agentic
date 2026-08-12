"""The pre-filter's behaviour, pinned to cases that came from real board data.

Every case here is a title that actually appeared on Greenhouse, Ashby or
SmartRecruiters during development. Three of them are regressions: the matcher
was rewritten twice because live data broke it, and these stop it regressing a
third time.
"""
from __future__ import annotations

import pytest

from career_agent import matching
from career_agent.models import CandidateProfile, JobListing

TARGET_TITLES = [
    "AI/ML Engineer",
    "Junior AI/ML Engineer",
    "Machine Learning Engineer",
    "Machine Learning Engineer I",
    "AI Engineer",
    "Applied AI Engineer",
    "Data Engineer",
    "Software Engineer, Machine Learning",
    "Backend Engineer",
    "Software Engineer",
]

EXCLUDE_KEYWORDS = [
    "staff", "principal", "director", "distinguished",
    "fellow", "vp", "vice president", "head of", "chief", "senior",
]


def profile(**overrides) -> CandidateProfile:
    base = dict(
        target_titles=TARGET_TITLES,
        must_have_skills=["Python"],
        min_years_experience=1,
        remote_only=False,
        allowed_locations=["Remote", "India"],
        min_salary=800000,
        min_salary_currency="INR",
        needs_visa_sponsorship=False,
        resume_master_text="irrelevant to the pre-filter",
    )
    base.update(overrides)
    return CandidateProfile(**base)


def listing(title: str, remote: bool = False) -> JobListing:
    return JobListing(
        job_id=f"test:{title}", source="test", title=title, company="Acme",
        location="Anywhere", remote=remote, url="", description="",
    )


class TestTitleMatches:
    @pytest.mark.parametrize("title", [
        "Senior Machine Learning Engineer",
        "Software Engineer, Machine Learning",
        "Machine Learning Engineer I",
        "Junior AI/ML Engineer",
        "Staff Backend Engineer",
        "Data Engineer",
        "Data Engineer, Safeguards",
        "Applied AI Engineer, Enterprise Tech",
        # Regression: strict contiguity rejected this real Anthropic posting,
        # which a prior run had genuinely matched. A qualifier may sit inside
        # the phrase.
        "Machine Learning Infrastructure Engineer, Safeguards Research",
    ])
    def test_accepts(self, title):
        assert matching.title_matches(title, TARGET_TITLES)

    @pytest.mark.parametrize("title", [
        "Engineering Manager, Revenue",
        # Regression: substring matching accepted this, because "software
        # engineer" is a substring of "software engineering manager".
        "Software Engineering Manager",
        "Director of Engineering, Safety",
        "Account Manager, Advertising Solutions",
        "Associate Product Counsel, Safety",
        "Advertising Operations Manager",
        # Regression: token-SUBSET matching accepted these once "Data Engineer"
        # was added as a target -- all the words present, just not together.
        "Data Center Electrical Engineer",
        "Data Center Mechanical Engineer",
    ])
    def test_rejects(self, title):
        assert not matching.title_matches(title, TARGET_TITLES)

    def test_empty_title_is_not_a_match(self):
        assert not matching.title_matches("", TARGET_TITLES)


class TestSeniorityExclusion:
    @pytest.mark.parametrize("title", [
        "Staff Software Engineer, Android",
        # Regression: the tokenizer kept a trailing '+', so "Staff+" became
        # "staff+" and slipped past a "staff" exclusion. Real postings use this.
        "Staff+ Software Engineer, Backend",
        "Staff + Senior Software Engineer, Inference",
        "Principal Machine Learning Engineer",
        "Director of Engineering, Safety",
        "Distinguished Engineer",
        "Head of Data Engineering",
        "VP, Machine Learning",
        "Senior Software Engineer, Full-stack",
    ])
    def test_excludes_above_level(self, title):
        assert matching.is_above_seniority(title, EXCLUDE_KEYWORDS)

    @pytest.mark.parametrize("title", [
        "Machine Learning Engineer",
        "Junior AI/ML Engineer",
        "Data Engineer, Safeguards",
        "Research Engineer",
        # Substring traps: these must NOT fire on head/vp/staff.
        "Overhead Systems Engineer",
        "VPN Infrastructure Engineer",
        "Software Engineer, Staffing Tools",
    ])
    def test_keeps_in_level(self, title):
        assert not matching.is_above_seniority(title, EXCLUDE_KEYWORDS)

    def test_empty_keyword_list_excludes_nothing(self):
        assert not matching.is_above_seniority("Staff Software Engineer", [])


class TestPrefilter:
    def test_counts_every_dropped_job_by_reason(self, monkeypatch):
        """Nothing may vanish silently -- the counts are a pre-filtered job's only record."""
        monkeypatch.setattr(matching.config, "EXCLUDE_TITLE_KEYWORDS", EXCLUDE_KEYWORDS)
        jobs = [
            listing("Machine Learning Engineer"),      # kept
            listing("Data Engineer"),                  # kept
            listing("Account Manager, Ads"),           # title
            listing("Data Center Electrical Engineer"),  # title
            listing("Staff Software Engineer"),        # seniority
        ]
        kept, reasons = matching.prefilter(jobs, profile())

        assert [j.title for j in kept] == ["Machine Learning Engineer", "Data Engineer"]
        assert reasons[matching.REASON_TITLE] == 2
        assert reasons[matching.REASON_SENIORITY] == 1
        assert len(kept) + sum(reasons.values()) == len(jobs), "every job must be accounted for"

    def test_remote_only_drops_onsite(self, monkeypatch):
        monkeypatch.setattr(matching.config, "EXCLUDE_TITLE_KEYWORDS", [])
        jobs = [listing("Machine Learning Engineer", remote=False)]
        kept, reasons = matching.prefilter(jobs, profile(remote_only=True))
        assert kept == []
        assert reasons[matching.REASON_NOT_REMOTE] == 1

    def test_location_is_left_to_the_model_when_not_remote_only(self, monkeypatch):
        """Allowed locations are countries; postings name cities. A token compare
        here would drop good jobs, so the model decides with the full posting."""
        monkeypatch.setattr(matching.config, "EXCLUDE_TITLE_KEYWORDS", [])
        jobs = [listing("Machine Learning Engineer", remote=False)]
        kept, _ = matching.prefilter(jobs, profile(allowed_locations=["Remote", "India"]))
        assert len(kept) == 1
