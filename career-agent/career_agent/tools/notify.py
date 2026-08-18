"""Digest email delivery.

MVP simplification: uses SMTP (e.g. a Gmail app password) rather than the
Gmail API/OAuth, since it's a handful of lines instead of an OAuth consent
flow. Swap _send_smtp for a Gmail API call if you'd rather not use an app
password -- send_digest_email's signature doesn't need to change.
"""
from __future__ import annotations

import os
import smtplib
from email.mime.text import MIMEText

from .. import config


def _render_digest(matched: list[dict], skipped: list[dict], run_id: str, summary: dict | None = None) -> str:
    lines = [f"TalentOS // Careers digest -- run {run_id}", ""]
    lines.append(f"MATCHED ({len(matched)})")
    for a in matched:
        lines.append(f"- {a.get('title')} @ {a.get('company')} -- {a.get('url')}")
        if a.get("contact_email"):
            confidence = a.get("contact_confidence") or "unknown"
            lines.append(
                f"    contact: {a['contact_email']} "
                f"({a.get('contact_source')}, {confidence} confidence)"
            )
        for unknown in a.get("missing_information") or []:
            lines.append(f"    verify: {unknown}")
        lines.append(f"    draft resume + cover letter saved -- see applications/{a.get('job_id')} in Firestore")
    lines.append("")
    lines.append(f"SKIPPED ({len(skipped)})")
    for a in skipped:
        reasons = ", ".join(a.get("unmet_requirements", [])) or a.get("reasoning", "no reason recorded")
        lines.append(f"- {a.get('title')} @ {a.get('company')}: {reasons}")
        for unknown in a.get("missing_information") or []:
            lines.append(f"    (not stated in posting: {unknown})")

    if summary:
        lines.append("")
        lines.append("THIS RUN")
        lines.append(
            f"- {summary.get('fetched', 0)} postings fetched, "
            f"{summary.get('unseen', 0)} not seen before, "
            f"{summary.get('relevant_after_prefilter', 0)} matched a target title"
        )
        # Pre-filtered jobs never get an individual model-written reason, so
        # these counts are the only place they are accounted for.
        for reason, count in (summary.get("filtered_out") or {}).items():
            lines.append(f"- set aside without evaluation: {count} ({reason.replace('_', ' ')})")
        deferred = summary.get("deferred_to_next_run", 0)
        if deferred:
            lines.append(f"- {deferred} relevant postings deferred to the next run by the per-run cap")
        # A source that failed returned zero jobs, which is indistinguishable
        # from a source with nothing to offer unless it is called out.
        for source, error in (summary.get("source_errors") or {}).items():
            lines.append(f"- SOURCE FAILED: {source} -- {error}")
    return "\n".join(lines)


def send_digest_email(matched: list[dict], skipped: list[dict], run_id: str, summary: dict | None = None) -> None:
    body = _render_digest(matched, skipped, run_id, summary)
    if not config.DIGEST_TO_EMAIL:
        print("DIGEST_TO_EMAIL not configured -- printing digest instead:\n", body)
        return
    _send_smtp(body, run_id)


def _send_smtp(body: str, run_id: str) -> None:
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", config.GMAIL_SENDER)
    password = os.environ.get("SMTP_PASSWORD", "")
    if not (user and password):
        print("SMTP not configured -- printing digest instead:\n", body)
        return
    msg = MIMEText(body)
    msg["Subject"] = f"TalentOS // Careers digest -- run {run_id}"
    msg["From"] = user
    msg["To"] = config.DIGEST_TO_EMAIL
    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(user, password)
        server.send_message(msg)


# --- TalentOS // Studio (Freelance Client Pipeline) ---------------------------


def _render_freelance_digest(matched: list[dict], skipped: list[dict], run_id: str, summary: dict | None = None) -> str:
    lines = [f"TalentOS // Studio digest -- run {run_id}", ""]
    lines.append(f"MATCHED LEADS ({len(matched)})")
    for lead in matched:
        lines.append(f"- {lead.get('title')} -- {lead.get('url')}")
        if lead.get("budget"):
            lines.append(f"    budget: {lead['budget']}")
        if lead.get("timeline"):
            lines.append(f"    timeline: {lead['timeline']}")
        if lead.get("contact_method"):
            lines.append(f"    send via: {lead['contact_method']}")
        for unknown in lead.get("missing_information") or []:
            lines.append(f"    clarify: {unknown}")
        lines.append(f"    pitch saved -- see pitches/{lead.get('lead_id')} in Firestore")
    lines.append("")
    lines.append(f"SKIPPED LEADS ({len(skipped)})")
    for lead in skipped:
        reasons = ", ".join(lead.get("unmet_requirements", [])) or lead.get("reasoning", "no reason recorded")
        lines.append(f"- {lead.get('title')}: {reasons}")
        for unknown in lead.get("missing_information") or []:
            lines.append(f"    (not stated in lead: {unknown})")

    if summary:
        lines.append("")
        lines.append("THIS RUN")
        lines.append(f"- {summary.get('evaluated', 0)} leads evaluated")
        cost = summary.get("cost_usd")
        if cost is not None:
            lines.append(f"- estimated cost: ${cost}")
    return "\n".join(lines)


def send_freelance_digest_email(matched: list[dict], skipped: list[dict], run_id: str, summary: dict | None = None) -> None:
    body = _render_freelance_digest(matched, skipped, run_id, summary)
    if not config.DIGEST_TO_EMAIL:
        print("DIGEST_TO_EMAIL not configured -- printing freelance digest instead:\n", body)
        return
    _send_freelance_smtp(body, run_id)


def _send_freelance_smtp(body: str, run_id: str) -> None:
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", config.GMAIL_SENDER)
    password = os.environ.get("SMTP_PASSWORD", "")
    if not (user and password):
        print("SMTP not configured -- printing freelance digest instead:\n", body)
        return
    msg = MIMEText(body)
    msg["Subject"] = f"TalentOS // Studio digest -- run {run_id}"
    msg["From"] = user
    msg["To"] = config.DIGEST_TO_EMAIL
    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(user, password)
        server.send_message(msg)
