"""Render a tailored resume to a self-contained, printable HTML document.

Layout is deterministic and lives here, not in the model's output: the model
decides what to say and what to lead with, this decides how it looks. That
keeps every generated resume visually identical and means a formatting change
does not require re-running any model.

No external CSS, fonts or scripts, so it prints correctly offline and cannot
break because a CDN moved. Browser Print -> Save as PDF produces the file to
attach to an application; the @media print rules drop the on-screen chrome.
"""
from __future__ import annotations

from html import escape

_STYLE = """
:root { --ink: #16161a; --muted: #5b5b66; --rule: #d8d5d0; --accent: #23507a; }
* { box-sizing: border-box; }
body {
  margin: 0; background: #f4f2ef; color: var(--ink);
  font: 10.5pt/1.45 "Segoe UI", -apple-system, ui-sans-serif, sans-serif;
}
.sheet {
  background: #fff; max-width: 210mm; min-height: 297mm; margin: 16px auto;
  padding: 16mm 15mm; box-shadow: 0 1px 4px rgba(0,0,0,.12);
}
.bar { max-width: 210mm; margin: 16px auto 0; display: flex; gap: 8px; flex-wrap: wrap; }
.bar a, .bar button {
  font: inherit; font-size: 9.5pt; cursor: pointer; text-decoration: none;
  color: #fff; background: var(--ink); border: 0; border-radius: 5px; padding: 7px 13px;
}
.bar .muted { color: var(--muted); background: none; padding: 7px 0; }
h1 { font-size: 19pt; margin: 0; letter-spacing: -.01em; }
.headline { color: var(--accent); font-size: 11pt; margin: 3px 0 2px; font-weight: 600; }
.contact { color: var(--muted); font-size: 9.5pt; }
h2 {
  font-size: 9.5pt; text-transform: uppercase; letter-spacing: .09em;
  margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1px solid var(--rule);
}
.summary { margin: 10px 0 0; }
.entry { margin-bottom: 10px; }
.entry-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.entry-title { font-weight: 600; }
.entry-org { color: var(--muted); }
.entry-dates { color: var(--muted); font-size: 9.5pt; white-space: nowrap; }
ul { margin: 4px 0 0; padding-left: 16px; }
li { margin-bottom: 2px; }
.skills { margin: 0; }
.edu { list-style: none; padding: 0; margin: 0; }
.edu li { margin-bottom: 3px; }
@media print {
  body { background: #fff; }
  .bar { display: none; }
  .sheet { box-shadow: none; margin: 0; max-width: none; min-height: 0; padding: 0; }
  @page { margin: 14mm; }
}
"""


def _entry(entry: dict) -> str:
    bullets = "".join(f"<li>{escape(str(b))}</li>" for b in (entry.get("bullets") or []))
    org = escape(str(entry.get("organization") or ""))
    dates = escape(str(entry.get("dates") or ""))
    return (
        '<div class="entry"><div class="entry-head"><div>'
        f'<span class="entry-title">{escape(str(entry.get("title") or ""))}</span>'
        + (f' <span class="entry-org">&middot; {org}</span>' if org else "")
        + "</div>"
        + (f'<div class="entry-dates">{dates}</div>' if dates else "")
        + "</div>"
        + (f"<ul>{bullets}</ul>" if bullets else "")
        + "</div>"
    )


def _section(title: str, body: str) -> str:
    return f"<h2>{escape(title)}</h2>{body}" if body else ""


def render(resume: dict, name: str, contact_line: str, job_title: str = "", company: str = "") -> str:
    """Builds the full HTML document for one tailored resume."""
    resume = resume or {}
    target = " &mdash; ".join(p for p in (escape(job_title or ""), escape(company or "")) if p)

    experience = "".join(_entry(e) for e in (resume.get("experience") or []))
    projects = "".join(_entry(e) for e in (resume.get("projects") or []))
    # Escape each skill, then join with the separator entity -- escaping the
    # joined string would mangle the separator itself.
    skills = " &middot; ".join(escape(str(s)) for s in (resume.get("skills") or []))
    education = "".join(f"<li>{escape(str(e))}</li>" for e in (resume.get("education") or []))

    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>{escape(name or 'Resume')}"
        + (f" &mdash; {escape(job_title)}" if job_title else "")
        + f"</title><style>{_STYLE}</style></head><body>"
        '<div class="bar">'
        '<button onclick="window.print()">Print / Save as PDF</button>'
        + (f'<span class="muted">Tailored for {target}</span>' if target else "")
        + "</div>"
        '<div class="sheet">'
        f"<h1>{escape(name or '')}</h1>"
        + (f'<div class="headline">{escape(str(resume.get("headline") or ""))}</div>' if resume.get("headline") else "")
        + (f'<div class="contact">{escape(contact_line or "")}</div>' if contact_line else "")
        + (f'<p class="summary">{escape(str(resume.get("summary") or ""))}</p>' if resume.get("summary") else "")
        + _section("Skills", f'<p class="skills">{skills}</p>' if skills else "")
        + _section("Experience", experience)
        + _section("Projects", projects)
        + _section("Education & Achievements", f'<ul class="edu">{education}</ul>' if education else "")
        + "</div></body></html>"
    )
