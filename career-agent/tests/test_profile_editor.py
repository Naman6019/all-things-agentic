"""Profile editor: form rendering and the parsing that turns it back into a profile.

Offline. Firestore round-trips are exercised separately against a real project;
what matters here is that the form covers the schema and that parsing does not
quietly lose or corrupt a field.
"""
from __future__ import annotations

import pytest

from career_agent import config, profile_ui
from career_agent.models import CandidateProfile

PROFILE = CandidateProfile(
    target_titles=["AI Engineer", "ML Engineer"],
    must_have_skills=["Python"],
    min_years_experience=1,
    remote_only=False,
    allowed_locations=["Remote", "India"],
    min_salary=800000,
    min_salary_currency="INR",
    needs_visa_sponsorship=False,
    resume_master_text="Master resume text.",
    writing_voice_samples=["First sample.", "Second sample."],
    portfolio_links=["https://example.com"],
    full_name="Some One",
    contact_line="City | a@b.com",
    github_username="someone",
    excluded_projects=["Gaming_Bot"],
)


class TestFormCoverage:
    def test_every_editable_profile_field_has_a_form_field(self):
        """A profile field with no form field is one the user cannot fix, and
        which silently resets to its default when they save."""
        editable = set(CandidateProfile.__dataclass_fields__)
        covered = {name for name, _, _, _ in profile_ui.FIELDS}
        assert editable - covered == set(), f"not editable: {editable - covered}"

    def test_no_form_field_refers_to_a_nonexistent_profile_field(self):
        editable = set(CandidateProfile.__dataclass_fields__)
        covered = {name for name, _, _, _ in profile_ui.FIELDS}
        assert covered - editable == set(), f"not on the profile: {covered - editable}"

    def test_every_field_explains_what_it_changes(self):
        for name, label, _, help_text in profile_ui.FIELDS:
            assert label, f"{name} has no label"
            assert len(help_text) > 20, f"{name} has no meaningful help text"


class TestRendering:
    def test_current_values_are_prefilled(self):
        out = profile_ui.render(PROFILE)
        assert "AI Engineer\nML Engineer" in out or "AI Engineer" in out
        assert "Master resume text." in out
        assert "someone" in out
        assert "Gaming_Bot" in out

    def test_booleans_reflect_state(self):
        on = profile_ui.render(CandidateProfile(**{**PROFILE.__dict__, "remote_only": True}))
        off = profile_ui.render(PROFILE)
        assert on.count("checked") > off.count("checked")

    def test_escapes_user_content(self):
        nasty = CandidateProfile(**{**PROFILE.__dict__, "full_name": "<script>x</script>"})
        out = profile_ui.render(nasty)
        assert "<script>x</script>" not in out
        assert "&lt;script&gt;" in out

    def test_save_flash_warns_about_re_evaluation(self):
        """Editing the profile changes the fingerprint, which puts previously
        skipped jobs back in the queue. The user should not discover that from
        a surprise bill."""
        assert "skipped" in profile_ui.render(PROFILE, saved=True)

    def test_error_is_shown(self):
        assert "boom" in profile_ui.render(PROFILE, error="boom")


class TestProfileFromDict:
    def test_ignores_unknown_keys(self):
        """Stored profiles outlive the schema; a removed field must not make
        every saved profile unloadable."""
        got = config._profile_from_dict({**PROFILE.__dict__, "retired_field": "x"})
        assert got.target_titles == PROFILE.target_titles

    def test_missing_optional_fields_fall_back_to_defaults(self):
        minimal = {
            "target_titles": ["AI Engineer"],
            "must_have_skills": [],
            "min_years_experience": 0,
            "remote_only": False,
            "allowed_locations": [],
            "min_salary": None,
            "min_salary_currency": "INR",
            "needs_visa_sponsorship": False,
            "resume_master_text": "text",
        }
        got = config._profile_from_dict(minimal)
        assert got.excluded_projects == []
        assert got.github_username == ""


class TestCacheInvalidation:
    def test_invalidate_forces_a_reload(self, monkeypatch):
        """A cached profile that ignores an edit is worse than no cache."""
        config.invalidate_profile_cache()
        monkeypatch.setattr(config, "_profile_cache", PROFILE)
        assert config.load_candidate_profile() is PROFILE
        config.invalidate_profile_cache()
        assert config._profile_cache is None
