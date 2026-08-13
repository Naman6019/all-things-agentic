"""Hiring-contact extraction.

This is the part of the product a user actually acts on -- they email the
address. A wrong address at high confidence is worse than no address, because
it spends the one impression they get on a mailbox that will not forward it.
"""
from __future__ import annotations

import pytest

from career_agent.tools import job_tools


class TestClassify:
    @pytest.mark.parametrize("email", [
        "careers@acme.com",
        "jobs@acme.io",
        "recruiting@acme.co.uk",
        "talent.team@acme.com",
        "hiring@acme.com",
        "hr@acme.com",
        "apply@acme.com",
    ])
    def test_hiring_mailboxes_are_high_confidence(self, email):
        assert job_tools._classify_contact(email) == "high"

    @pytest.mark.parametrize("email", [
        # The real one: a live posting produced this and it was reported as a
        # high-confidence hiring contact.
        "accommodations@scale.com",
        "accessibility@acme.com",
        "privacy@acme.com",
        "legal@acme.com",
        "noreply@acme.com",
        "no-reply@acme.com",
        "security@acme.com",
        "press@acme.com",
        "support@acme.com",
    ])
    def test_non_hiring_mailboxes_are_rejected(self, email):
        assert job_tools._classify_contact(email) is None

    @pytest.mark.parametrize("email", [
        "jane.doe@acme.com",
        "info@acme.com",
    ])
    def test_plausible_addresses_are_medium(self, email):
        """Neither obviously hiring nor obviously not -- a lead, not a fact."""
        assert job_tools._classify_contact(email) == "medium"


class TestEmailPattern:
    def test_does_not_swallow_a_sentence_final_full_stop(self):
        """The original bug: the regex ended in [\\w.-]+ and captured the period,
        producing an address that does not exist."""
        found = job_tools._EMAIL_RE.findall("Write to careers@acme.com.")
        assert found == ["careers@acme.com"]

    def test_handles_multi_part_domains(self):
        assert job_tools._EMAIL_RE.findall("jobs@acme.co.uk") == ["jobs@acme.co.uk"]

    def test_finds_several(self):
        text = "Privacy: privacy@acme.com. Jobs: careers@acme.com."
        assert job_tools._EMAIL_RE.findall(text) == ["privacy@acme.com", "careers@acme.com"]


class TestFindHiringContact:
    @pytest.mark.asyncio
    async def test_prefers_a_hiring_address_over_an_earlier_plausible_one(self):
        text = "Questions to jane.doe@acme.com, applications to careers@acme.com."
        got = await job_tools.find_hiring_contact("Acme", text, "")
        assert got["email"] == "careers@acme.com"
        assert got["confidence"] == "high"

    @pytest.mark.asyncio
    async def test_skips_the_accessibility_mailbox_entirely(self):
        """Reproduces the live failure: the rejected address must not be
        returned at all, not merely downgraded."""
        text = "For accommodations email accommodations@scale.com. Apply online."
        got = await job_tools.find_hiring_contact("Scale", text, "")
        assert got["email"] != "accommodations@scale.com"
        assert got["source"] == "pattern_guess"
        assert got["confidence"] == "low"

    @pytest.mark.asyncio
    async def test_falls_back_to_a_labelled_guess_when_nothing_is_found(self):
        got = await job_tools.find_hiring_contact("Acme Corp", "No addresses here.", "")
        assert got == {
            "email": "careers@acmecorp.com",
            "source": "pattern_guess",
            "confidence": "low",
        }

    @pytest.mark.asyncio
    async def test_a_plausible_address_is_returned_as_medium(self):
        got = await job_tools.find_hiring_contact("Acme", "Reach jane.doe@acme.com", "")
        assert got == {
            "email": "jane.doe@acme.com",
            "source": "job_posting_text",
            "confidence": "medium",
        }
