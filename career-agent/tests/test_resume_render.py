"""Resume rendering. This document goes to an employer under the user's name."""
from __future__ import annotations

from career_agent import resume_render

RESUME = {
    "headline": "AI/ML Engineer - LLMs, RAG & Applied ML",
    "summary": "Built a live research platform with citation-grounded retrieval.",
    "skills": ["Python", "FastAPI", "LangGraph", "pgvector"],
    "experience": [
        {
            "title": "Technology Manager",
            "organization": "PayGain Multiservices",
            "dates": "Feb 2025 - Present",
            "bullets": ["Drove 30+ client conversions.", "Ran 20+ technical presentations."],
        }
    ],
    "projects": [
        {
            "title": "FundersAI",
            "organization": "Solo-built",
            "dates": "Apr-Aug 2026",
            "bullets": ["Retrieval over ~10,400 embedded chunks."],
        }
    ],
    "education": ["B.Tech CSE (AI & ML) - VIT Amaravati"],
}


def html() -> str:
    return resume_render.render(
        RESUME, name="Naman Manocha", contact_line="Kolkata | a@b.com",
        job_title="ML Engineer", company="Acme",
    )


class TestContent:
    def test_includes_every_section_and_entry(self):
        out = html()
        for expected in [
            "Naman Manocha", "Kolkata | a@b.com",
            "AI/ML Engineer", "citation-grounded",
            "Python", "pgvector",
            "Technology Manager", "PayGain Multiservices", "Feb 2025 - Present",
            "Drove 30+ client conversions.", "FundersAI", "10,400",
            "B.Tech CSE",
        ]:
            assert expected in out, f"missing from rendered resume: {expected}"

    def test_names_the_target_role(self):
        assert "ML Engineer" in html() and "Acme" in html()

    def test_is_self_contained(self):
        """No CDN, font host or external script: it must print correctly offline
        and cannot break because someone else's asset moved."""
        out = html()
        assert "http://" not in out
        assert "https://" not in out
        assert "<link" not in out

    def test_has_a_print_stylesheet(self):
        assert "@media print" in html()


class TestSafety:
    def test_escapes_html_in_model_output(self):
        """The model's text is interpolated into a document; unescaped markup
        would corrupt the layout at best."""
        out = resume_render.render(
            {"headline": "<script>alert(1)</script>", "skills": ["a & b"]},
            name="X & Y", contact_line="",
        )
        assert "<script>alert(1)</script>" not in out
        assert "&lt;script&gt;" in out
        assert "X &amp; Y" in out

    def test_skill_separator_survives_escaping(self):
        """Escaping the joined string instead of each skill would mangle the
        separator into a visible &amp;middot;."""
        out = resume_render.render({"skills": ["Python", "SQL"]}, name="N", contact_line="")
        assert "&amp;middot;" not in out
        assert "&middot;" in out


class TestMissingData:
    def test_empty_resume_still_renders(self):
        out = resume_render.render({}, name="N", contact_line="")
        assert "<html" in out and "N" in out

    def test_none_resume_still_renders(self):
        assert "<html" in resume_render.render(None, name="N", contact_line="")

    def test_sections_with_no_content_are_omitted(self):
        out = resume_render.render({"summary": "s"}, name="N", contact_line="")
        assert "Experience" not in out
        assert "Projects" not in out

    def test_entry_without_dates_or_bullets(self):
        out = resume_render.render(
            {"experience": [{"title": "Engineer"}]}, name="N", contact_line=""
        )
        assert "Engineer" in out
        assert "<ul>" not in out
