"""Public-work enrichment. Offline: no GitHub calls, only the rendering logic."""
from __future__ import annotations

from career_agent.sources import profile_sources
from career_agent.sources.profile_sources import GithubProfile, PublicRepo

PROFILE = GithubProfile(
    username="someone",
    name="Some One",
    bio="Building things",
    public_repos=23,
    repos=[
        PublicRepo(
            name="PulseNotify",
            description="",  # most real repos have none -- the README carries the stack
            language="Python",
            topics=["celery", "django"],
            stars=0,
            pushed_at="2026-08-11",
            url="https://github.com/someone/PulseNotify",
            readme_excerpt=(
                "PulseNotify is an automated flight price monitoring backend built with "
                "Django REST Framework, Celery, Celery Beat, Redis and PostgreSQL."
            ),
        ),
        PublicRepo(
            name="Gaming_Bot",
            description="A gaming assistant",
            language="JavaScript",
            topics=[],
            stars=3,
            pushed_at="2026-03-11",
            url="https://github.com/someone/Gaming_Bot",
        ),
    ],
)


class TestPromptBlock:
    def test_full_block_includes_readme_detail(self):
        out = profile_sources.as_prompt_block(PROFILE)
        assert "PulseNotify" in out
        assert "Celery Beat" in out
        assert "topics: celery, django" in out
        assert "Building things" in out

    def test_compact_keeps_the_readme(self):
        """The compact form is for the evaluator. Dropping the README would make
        it useless: most repos have no description, so the README is the only
        place the stack is stated."""
        out = profile_sources.as_prompt_block(PROFILE, compact=True)
        assert "Django REST Framework" in out
        assert "Celery" in out

    def test_compact_is_materially_smaller(self):
        full = profile_sources.as_prompt_block(PROFILE)
        compact = profile_sources.as_prompt_block(PROFILE, compact=True)
        assert len(compact) < len(full)

    def test_compact_tells_the_evaluator_this_counts(self):
        """Without this the evaluator rejects jobs the candidate is qualified for
        because the resume does not mention the skill."""
        out = profile_sources.as_prompt_block(PROFILE, compact=True)
        assert "count toward" in out

    def test_both_forms_warn_against_inferring_from_a_name(self):
        for out in (
            profile_sources.as_prompt_block(PROFILE),
            profile_sources.as_prompt_block(PROFILE, compact=True),
        ):
            assert "name" in out.lower()

    def test_accepts_a_plain_dict_as_stored_in_firestore(self):
        from dataclasses import asdict

        assert "PulseNotify" in profile_sources.as_prompt_block(asdict(PROFILE))

    def test_no_repos_renders_nothing(self):
        """A user with no public work must add no section at all, rather than an
        empty header the model would try to reason about."""
        assert profile_sources.as_prompt_block(GithubProfile(username="x")) == ""
        assert profile_sources.as_prompt_block({}) == ""


class TestReadmeCleaning:
    def test_strips_badge_lines(self):
        out = profile_sources._clean_readme("[![Build](https://img.shields.io/x)](https://ci)\nReal text.")
        assert "shields.io" not in out
        assert "Real text." in out

    def test_strips_heading_markers_but_keeps_the_words(self):
        out = profile_sources._clean_readme("# Title\n\nSome prose.")
        assert "Title" in out and "# Title" not in out

    def test_truncates(self):
        assert len(profile_sources._clean_readme("x" * 5000)) <= profile_sources._README_CHARS

    def test_empty_input(self):
        assert profile_sources._clean_readme("") == ""


class TestFailureIsNonFatal:
    async def test_missing_username_returns_an_error_not_an_exception(self):
        """Enrichment is a bonus. A failure must never stop a run from drafting."""
        got = await profile_sources.fetch_github("", client=None)
        assert got.error
        assert got.repos == []
