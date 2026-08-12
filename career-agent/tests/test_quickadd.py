"""Quick-add, especially the URLs it must REFUSE to fetch.

The refusals are the point of the feature. Quick-add exists because
LinkedIn/Indeed/Glassdoor/Wellfound cannot be sources; if it silently fetched
them it would become the scraper the project's guardrails exist to prevent.
"""
from __future__ import annotations

import pytest

from career_agent import quickadd

POSTING = (
    "Acme is hiring a Machine Learning Engineer in Bengaluru. Requirements: "
    "2+ years of Python, vector databases, LLM orchestration. Salary 25-35 LPA."
)


class TestBlockedHosts:
    @pytest.mark.parametrize("url", [
        "https://www.linkedin.com/jobs/view/4012345678",
        "https://www.indeed.com/viewjob?jk=abc123",
        "https://www.glassdoor.com/job-listing/ml-engineer",
        "https://wellfound.com/jobs/12345-ml-engineer",
        "https://angel.co/company/acme/jobs/123",
    ])
    def test_recognised_as_blocked(self, url):
        assert quickadd.is_blocked_host(url)

    @pytest.mark.parametrize("url", [
        "https://job-boards.greenhouse.io/anthropic/jobs/5115935008",
        "https://jobs.lever.co/acme/abc-123-def",
        "https://jobs.ashbyhq.com/openai/240d459b-696d-43eb",
        "https://acme.example.com/careers/ml-engineer",
    ])
    def test_not_blocked(self, url):
        assert not quickadd.is_blocked_host(url)


class TestBuild:
    @pytest.mark.asyncio
    async def test_pasted_text_is_accepted(self):
        job = await quickadd.build(text=POSTING, title="ML Engineer", company="Acme")
        assert job.source == "quickadd"
        assert job.title == "ML Engineer"
        assert POSTING in job.description

    @pytest.mark.asyncio
    async def test_blocked_url_with_pasted_text_is_accepted_and_keeps_the_url(self):
        """The whole point: you may quick-add a LinkedIn job, we just won't fetch it."""
        url = "https://www.linkedin.com/jobs/view/4012345678"
        job = await quickadd.build(url=url, text=POSTING)
        assert job.url == url
        assert POSTING in job.description

    @pytest.mark.asyncio
    async def test_blocked_url_alone_is_refused_with_an_actionable_message(self):
        with pytest.raises(quickadd.QuickAddError) as e:
            await quickadd.build(url="https://www.linkedin.com/jobs/view/1")
        assert "paste" in str(e.value).lower()

    @pytest.mark.asyncio
    async def test_unknown_host_alone_is_refused(self):
        with pytest.raises(quickadd.QuickAddError):
            await quickadd.build(url="https://acme.example.com/careers/ml-engineer")

    @pytest.mark.asyncio
    async def test_empty_input_is_refused(self):
        with pytest.raises(quickadd.QuickAddError):
            await quickadd.build()

    @pytest.mark.asyncio
    async def test_too_short_text_is_refused(self):
        """A title alone gives the evaluator nothing to check requirements against."""
        with pytest.raises(quickadd.QuickAddError):
            await quickadd.build(text="ML Engineer at Acme")

    @pytest.mark.asyncio
    async def test_id_is_stable_across_repeated_pastes(self):
        a = await quickadd.build(text=POSTING)
        b = await quickadd.build(text=POSTING + "   ")
        assert a.job_id == b.job_id, "re-pasting must not create a duplicate"

    @pytest.mark.asyncio
    async def test_different_postings_get_different_ids(self):
        a = await quickadd.build(text=POSTING)
        b = await quickadd.build(text=POSTING.replace("Bengaluru", "Mumbai"))
        assert a.job_id != b.job_id
