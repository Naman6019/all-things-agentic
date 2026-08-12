"""Description cleaning. Greenhouse returns HTML-escaped HTML; Arbeitnow raw HTML."""
from __future__ import annotations

from career_agent.sources import text_utils


class TestHtmlToText:
    def test_unescapes_before_stripping_tags(self):
        """Greenhouse's `content` is escaped, so tags are not tags until unescaped.
        Stripping first would leave the markup as visible text."""
        raw = "&lt;p&gt;We need &lt;strong&gt;5+ years&lt;/strong&gt; of Python.&lt;/p&gt;"
        assert text_utils.html_to_text(raw) == "We need 5+ years of Python."

    def test_keeps_block_boundaries_as_newlines(self):
        raw = "<ul><li>GCP</li><li>K8s</li></ul>"
        assert text_utils.html_to_text(raw).split("\n") == ["GCP", "K8s"]

    def test_handles_double_escaped_entities(self):
        assert "&nbsp;" not in text_utils.html_to_text("&amp;nbsp;Python")

    def test_empty_input(self):
        assert text_utils.html_to_text("") == ""
        assert text_utils.html_to_text(None) == ""

    def test_plain_text_survives(self):
        assert text_utils.html_to_text("Requires 3 years of Python.") == "Requires 3 years of Python."


class TestTruncate:
    def test_short_text_untouched(self):
        assert text_utils.truncate("short", 100) == "short"

    def test_marks_the_cut(self):
        """Silent truncation would let the model read a cut-off requirement as an
        absent one, which under the unknown-vs-unmet rule is a wrong verdict."""
        out = text_utils.truncate("x" * 50, 20)
        assert out.startswith("x" * 20)
        assert "truncated" in out
        assert "30" in out, "should say how much is missing"

    def test_boundary_is_not_truncated(self):
        assert text_utils.truncate("x" * 20, 20) == "x" * 20


def test_clean_description_composes_both():
    raw = "&lt;p&gt;" + ("A" * 20000) + "&lt;/p&gt;"
    out = text_utils.clean_description(raw)
    assert "<p" not in out and "&lt;" not in out
    assert len(out) < 20000
    assert "truncated" in out
