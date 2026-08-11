"""Normalize source descriptions into the plain text the model actually reads.

Greenhouse returns its `content` field as HTML-escaped HTML (so `&lt;p&gt;`
rather than `<p>`), and Arbeitnow returns raw HTML. Passed through untouched,
the model spends its context on markup and entity noise instead of the
requirements we need it to reason about.
"""
from __future__ import annotations

import html
import re

# A posting long enough to hit this is padding (boilerplate benefits sections,
# equal-opportunity statements) well past the requirements, which sit near the
# top. The Arbeitnow feed's longest single description measured ~58k characters.
MAX_DESCRIPTION_CHARS = 12000

_BLOCK_END_RE = re.compile(r"(?i)<\s*(?:br|/p|/div|/li|/tr|/h[1-6])\s*/?>")
_TAG_RE = re.compile(r"<[^>]+>")
_SPACES_RE = re.compile(r"[ \t ]+")
_BLANK_LINES_RE = re.compile(r"\n{3,}")


def html_to_text(raw: str) -> str:
    """Converts a possibly-HTML, possibly-escaped description to plain text."""
    if not raw:
        return ""
    # Unescape first: Greenhouse's content is escaped, so the tags are not
    # actually tags until this runs.
    text = html.unescape(raw)
    # Preserve document structure as newlines before dropping the tags, or the
    # whole posting collapses into one unreadable paragraph.
    text = _BLOCK_END_RE.sub("\n", text)
    text = _TAG_RE.sub(" ", text)
    # A second pass catches double-escaped entities (`&amp;nbsp;`), which show
    # up in a minority of Greenhouse boards.
    text = html.unescape(text)
    text = _SPACES_RE.sub(" ", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    text = _BLANK_LINES_RE.sub("\n\n", text)
    return text.strip()


def truncate(text: str, limit: int = MAX_DESCRIPTION_CHARS) -> str:
    """Caps description length, flagging the cut so the model knows text is missing.

    Silent truncation would let the model conclude a requirement is absent when
    it was merely cut off, which under the unknown-vs-unmet rule is the
    difference between "not stated" and a wrong verdict.
    """
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + f"\n\n[truncated: {len(text) - limit} more characters not shown]"


def clean_description(raw: str) -> str:
    """html_to_text + truncate, which is what every source wants."""
    return truncate(html_to_text(raw))
