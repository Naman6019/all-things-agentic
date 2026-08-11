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


def _render_digest(matched: list[dict], skipped: list[dict], run_id: str) -> str:
    lines = [f"Career Agent digest -- run {run_id}", ""]
    lines.append(f"MATCHED ({len(matched)})")
    for a in matched:
        lines.append(f"- {a.get('title')} @ {a.get('company')} -- {a.get('url')}")
        if a.get("contact_email"):
            lines.append(f"    contact: {a['contact_email']} ({a.get('contact_source')})")
        lines.append(f"    draft resume + cover letter saved -- see applications/{a.get('job_id')} in Firestore")
    lines.append("")
    lines.append(f"SKIPPED ({len(skipped)})")
    for a in skipped:
        reasons = ", ".join(a.get("unmet_requirements", [])) or a.get("reasoning", "no reason recorded")
        lines.append(f"- {a.get('title')} @ {a.get('company')}: {reasons}")
    return "\n".join(lines)


def send_digest_email(matched: list[dict], skipped: list[dict], run_id: str) -> None:
    body = _render_digest(matched, skipped, run_id)
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
    msg["Subject"] = f"Career Agent digest -- run {run_id}"
    msg["From"] = user
    msg["To"] = config.DIGEST_TO_EMAIL
    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(user, password)
        server.send_message(msg)
