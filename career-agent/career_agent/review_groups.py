"""Build the grouped read model used by TalentOS // Careers review surfaces."""
from __future__ import annotations

import re
import unicodedata


_COMPANY_SUFFIXES = re.compile(
    r"(?:\s+(?:incorporated|inc|limited|ltd|llc|plc|corp(?:oration)?|pvt|private))+\s*$"
)
_NON_WORD = re.compile(r"[^\w]+", re.UNICODE)


def _normalized_words(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold().replace("&", " and ")
    return " ".join(_NON_WORD.sub(" ", value).split())


def normalized_company(value: str) -> str:
    """Normalize presentation differences without merging different employers."""
    return _COMPANY_SUFFIXES.sub("", _normalized_words(value)).strip()


def normalized_title(value: str) -> str:
    """Normalize case, punctuation and whitespace while preserving role meaning."""
    return _normalized_words(value)


def group_applications(applications: list[dict]) -> list[dict]:
    """Group duplicate roles and retain every original posting target."""
    grouped: dict[tuple[str, str], dict] = {}
    for application in applications:
        key = (
            normalized_company(str(application.get("company") or "")),
            normalized_title(str(application.get("title") or "")),
        )
        # Missing identity is safer left ungrouped than accidentally collapsed.
        if not all(key):
            key = (f"job:{application.get('job_id', '')}", "")

        posting = {
            field: application.get(field)
            for field in ("job_id", "location", "remote", "url", "source", "posted_at")
        }
        posting = {field: value for field, value in posting.items() if value is not None}

        if key not in grouped:
            grouped[key] = {
                **application,
                "group_key": "::".join(key),
                "postings": [posting],
                "posting_count": 1,
            }
            continue

        group = grouped[key]
        group["postings"].append(posting)
        group["posting_count"] = len(group["postings"])

    return list(grouped.values())


def group_member_ids(applications: list[dict], job_id: str) -> list[str]:
    """Every posting id sharing a grouped card with job_id, that id included.

    A grouped card is one row to the human but several application documents
    underneath. Deriving the set here rather than having each UI enumerate it
    is what stops "mark as applied" from being a half-update that leaves the
    duplicates sitting in the to-apply list.
    """
    for group in group_applications(applications):
        member_ids = [
            str(posting["job_id"]) for posting in group["postings"] if posting.get("job_id")
        ]
        if job_id in member_ids:
            return member_ids
    return [job_id]
