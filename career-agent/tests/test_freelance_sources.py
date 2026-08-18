"""Hermetic offline tests for the TalentOS // Studio freelance source parsers.

These tests never hit the network -- they feed fixed RSS/JSON payloads to the
parser functions and assert the ClientLead dataclasses come out correctly.
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock
import httpx
from career_agent.sources import freelance_boards


class httpx_error:
    """A side_effect that raises an httpx.HTTPError for async calls."""
    def __call__(self, *args, **kwargs):
        raise httpx.HTTPError("network error")


RFORHIRE_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>r/forhire</title>
    <item>
      <title>[Hiring] React developer for landing page, $500, 2 weeks</title>
      <link>https://www.reddit.com/r/forhire/comments/abc123/hiring_react_dev</link>
      <description>Need a React developer to build a landing page. Budget $500, timeline 2 weeks.</description>
      <pubDate>Mon, 18 Aug 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>[Hiring] Full-stack dev for SaaS MVP</title>
      <link>https://www.reddit.com/r/forhire/comments/def456/hiring_fullstack</link>
      <description>Looking for someone to build an MVP. Hourly $40-60/hr.</description>
      <pubDate>Mon, 18 Aug 2026 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>"""


WWR_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>We Work Remotely</title>
    <item>
      <title>Acme Corp: Frontend Contractor</title>
      <link>https://weworkremotely.com/remote-jobs/12345</link>
      <description>We need a frontend contractor for 3 months. Budget: $5000/month.</description>
      <pubDate>Mon, 18 Aug 2026 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>"""


CONTRA_JSON = """[{"id":"abc","title":"Need Shopify theme dev","client":"ShopCo","budget":"$1000","timeline":"1 week","url":"https://contra.com/projects/abc","description":"Need someone to customize a Shopify theme."}]"""


class TestRforhireParser:
    @pytest.mark.asyncio
    async def test_parses_hiring_posts(self):
        client = AsyncMock()
        resp = AsyncMock()
        resp.status_code = 200
        resp.text = RFORHIRE_RSS
        resp.raise_for_status = lambda: None
        client.get.return_value = resp

        leads = await freelance_boards.fetch_rforhire(client)
        assert len(leads) == 2
        assert leads[0].source == "rforhire"
        assert "React developer" in leads[0].title
        assert leads[0].lead_id.startswith("rforhire:")
        assert leads[0].url.startswith("https://www.reddit.com/")

    @pytest.mark.asyncio
    async def test_strips_hiring_prefix(self):
        client = AsyncMock()
        resp = AsyncMock()
        resp.status_code = 200
        resp.text = RFORHIRE_RSS
        resp.raise_for_status = lambda: None
        client.get.return_value = resp

        leads = await freelance_boards.fetch_rforhire(client)
        assert not leads[0].title.startswith("[Hiring]")

    @pytest.mark.asyncio
    async def test_extracts_budget_from_title(self):
        client = AsyncMock()
        resp = AsyncMock()
        resp.status_code = 200
        resp.text = RFORHIRE_RSS
        resp.raise_for_status = lambda: None
        client.get.return_value = resp

        leads = await freelance_boards.fetch_rforhire(client)
        assert "$500" in leads[0].budget

    @pytest.mark.asyncio
    async def test_extracts_timeline(self):
        client = AsyncMock()
        resp = AsyncMock()
        resp.status_code = 200
        resp.text = RFORHIRE_RSS
        resp.raise_for_status = lambda: None
        client.get.return_value = resp

        leads = await freelance_boards.fetch_rforhire(client)
        assert "2 weeks" in leads[0].timeline


class TestWWRParser:
    @pytest.mark.asyncio
    async def test_parses_wwr_contract(self):
        client = AsyncMock()
        resp = AsyncMock()
        resp.status_code = 200
        resp.text = WWR_RSS
        resp.raise_for_status = lambda: None
        client.get.return_value = resp

        leads = await freelance_boards.fetch_wwr_contract(client)
        assert len(leads) == 1
        assert leads[0].source == "wwr"
        assert leads[0].client == "Acme Corp"
        assert leads[0].title == "Frontend Contractor"
        assert leads[0].lead_id.startswith("wwr:")

    @pytest.mark.asyncio
    async def test_wwr_extracts_budget(self):
        client = AsyncMock()
        resp = AsyncMock()
        resp.status_code = 200
        resp.text = WWR_RSS
        resp.raise_for_status = lambda: None
        client.get.return_value = resp

        leads = await freelance_boards.fetch_wwr_contract(client)
        assert "$5000" in leads[0].budget


class TestContraParser:
    @pytest.mark.asyncio
    async def test_parses_contra_projects(self):
        import json
        client = AsyncMock()
        resp = AsyncMock()
        resp.status_code = 200
        # .json() must return synchronously (not a coroutine) for the parser
        resp.json = lambda: json.loads(CONTRA_JSON)
        resp.raise_for_status = lambda: None
        client.get.return_value = resp

        leads = await freelance_boards.fetch_contra(client)
        assert len(leads) == 1
        assert leads[0].source == "contra"
        assert leads[0].title == "Need Shopify theme dev"
        assert leads[0].client == "ShopCo"
        assert leads[0].budget == "$1000"
        assert leads[0].lead_id.startswith("contra:")

    @pytest.mark.asyncio
    async def test_contra_returns_empty_on_error(self):
        client = AsyncMock()
        client.get.side_effect = httpx_error()
        leads = await freelance_boards.fetch_contra(client)
        assert leads == []


class TestBudgetExtraction:
    def test_fixed_budget(self):
        result = freelance_boards._extract_budget("Budget: $1500 for the project")
        assert "$1500" in result

    def test_hourly_rate(self):
        result = freelance_boards._extract_budget("Paying $50/hr, 20 hours")
        assert "$50" in result

    def test_no_budget(self):
        result = freelance_boards._extract_budget("Just need help with a landing page")
        assert result == ""


class TestTimelineExtraction:
    def test_weeks(self):
        result = freelance_boards._extract_timeline("Delivery in 3 weeks")
        assert "3 weeks" in result

    def test_asap(self):
        result = freelance_boards._extract_timeline("Need this ASAP")
        assert "ASAP" in result

    def test_no_timeline(self):
        result = freelance_boards._extract_timeline("Flexible on timeline")
        assert result == ""


class TestTitleHelpers:
    def test_strip_hiring_prefix(self):
        assert freelance_boards._strip_hiring_prefix("[Hiring] React dev") == "React dev"
        assert freelance_boards._strip_hiring_prefix("Hiring: Full-stack") == "Full-stack"
        assert freelance_boards._strip_hiring_prefix("Regular title") == "Regular title"

    def test_split_wwr_title(self):
        company, title = freelance_boards._split_wwr_title("Acme Corp: Frontend Dev")
        assert company == "Acme Corp"
        assert title == "Frontend Dev"

    def test_split_wwr_title_no_colon(self):
        company, title = freelance_boards._split_wwr_title("Just a title")
        assert company == "WWR listing"
        assert title == "Just a title"


class TestClientLeadModel:
    def test_lead_id_is_stable(self):
        from career_agent.models import ClientLead

        lead = ClientLead(
            lead_id="rforhire:abc123",
            source="rforhire",
            title="Test gig",
            client="Test client",
            budget="$500",
            timeline="2 weeks",
            url="https://example.com",
            description="A test gig description that is long enough.",
        )
        assert lead.lead_id == "rforhire:abc123"
        assert lead.source == "rforhire"
        assert lead.fetched_at  # auto-populated


class TestLeadEvaluationModel:
    def test_default_values(self):
        from career_agent.models import LeadEvaluation

        eval = LeadEvaluation(
            lead_id="rforhire:abc123",
            match=True,
            unmet_requirements=[],
            reasoning="Strong match.",
        )
        assert eval.match_strength == "unscored"
        assert eval.missing_information == []
        assert eval.evaluated_at  # auto-populated


class TestPitchedMaterialsModel:
    def test_default_values(self):
        from career_agent.models import PitchedMaterials

        pitch = PitchedMaterials(
            lead_id="rforhire:abc123",
            pitch_message="Hi, I can build that landing page...",
        )
        assert pitch.relevant_portfolio == []
        assert pitch.suggested_rate is None
        assert pitch.contact_method is None
        assert pitch.created_at  # auto-populated


class TestFreelanceProfileOverlay:
    def test_profile_has_freelance_fields(self):
        from career_agent.models import CandidateProfile

        profile = CandidateProfile(
            target_titles=["Frontend Developer"],
            must_have_skills=["React"],
            min_years_experience=1,
            remote_only=True,
            allowed_locations=["India"],
            min_salary=None,
            min_salary_currency="USD",
            needs_visa_sponsorship=False,
            resume_master_text="Resume text",
        )
        assert profile.freelance_niche == ""
        assert profile.freelance_availability == ""
        assert profile.freelance_services == []
        assert profile.freelance_portfolio_summary == ""
        assert profile.freelance_rate_min is None
        assert profile.freelance_rate_currency == "USD"

    def test_profile_accepts_freelance_overlay(self):
        from career_agent.models import CandidateProfile

        profile = CandidateProfile(
            target_titles=["Frontend Developer"],
            must_have_skills=["React"],
            min_years_experience=1,
            remote_only=True,
            allowed_locations=["India"],
            min_salary=None,
            min_salary_currency="USD",
            needs_visa_sponsorship=False,
            resume_master_text="Resume text",
            freelance_niche="Web Development",
            freelance_availability="Available now",
            freelance_services=["Landing pages", "React apps"],
            freelance_portfolio_summary="I build fast, accessible React apps.",
        )
        assert profile.freelance_niche == "Web Development"
        assert profile.freelance_services == ["Landing pages", "React apps"]