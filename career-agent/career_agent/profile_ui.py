"""The profile editor: the fields the agent reads when judging and drafting.

Rendered here rather than expecting the user to hand-edit JSON, because on
Cloud Run the JSON file is a read-only Secret Manager mount and editing it
means a redeploy. Saved profiles live in Firestore; the file stays the
bootstrap path.

Every field is annotated with what it actually changes, because several of them
have non-obvious consequences -- target titles drive a pre-filter that runs
before any model call, and editing anything here puts previously skipped jobs
back in the queue.
"""
from __future__ import annotations

from html import escape

from .models import CandidateProfile
from .webui import _STYLE as _BASE_STYLE  # shared palette; webui owns the look

# (field, label, kind, help). kind: text | lines | int | bool | longtext
FIELDS = [
    ("full_name", "Full name", "text", "Appears as the heading on every generated resume."),
    ("contact_line", "Contact line", "text",
     "One line under your name on the resume. Location, email, links."),
    ("github_username", "GitHub username", "text",
     "Public repositories become evidence for both judging and drafting. "
     "Leave blank to disable. Refreshed at most daily."),
    ("target_titles", "Target titles", "lines",
     "One per line. A posting whose title matches none of these is dropped BEFORE "
     "any model call, so this is the strongest filter you control."),
    ("must_have_skills", "Must-have skills", "lines",
     "One per line. Each one added narrows what can match."),
    ("min_years_experience", "Years of experience", "int",
     "Your experience, compared against what a posting demands."),
    ("allowed_locations", "Allowed locations", "lines",
     "One per line. Countries work as well as cities; the model reads the posting "
     "in full rather than matching text."),
    ("remote_only", "Remote only", "bool",
     "When on, on-site postings are dropped before any model call."),
    ("min_salary", "Minimum salary", "int",
     "Left blank means no floor. Postings that state no salary are reported as "
     "unknown, never rejected."),
    ("min_salary_currency", "Salary currency", "text",
     "ISO code. The model converts before comparing, so INR against a USD posting "
     "is handled."),
    ("needs_visa_sponsorship", "Needs visa sponsorship", "bool",
     "Answer honestly: 'no' asserts you need none, and postings are matched on that."),
    ("excluded_projects", "Never include these projects", "lines",
     "One per line. The drafter already picks projects by relevance and does it "
     "well; this is your override for the ones it should never pick."),
    ("portfolio_links", "Portfolio links", "lines",
     "One per line. Given to the drafter, which may cite them in a cover letter "
     "when they are relevant to the posting."),
    ("resume_master_text", "Master resume", "longtext",
     "The source of truth for every tailored resume. The drafter reorders and "
     "rewords THIS -- it never invents. Detail here is what makes drafts good."),
    ("writing_voice_samples", "Writing voice samples", "longtext",
     "Optional. A paragraph or two of your own prose, so cover letters read like "
     "you. Blank produces competent but generic writing."),
]

_STYLE = """
.pf label { display: block; margin: 16px 0 0; }
.pf .name { font-weight: 600; font-size: 13.5px; }
.pf .help { color: var(--muted); font-size: 12.5px; margin: 2px 0 5px; }
.pf input[type=text], .pf input[type=number], .pf textarea {
  font: inherit; font-size: 13.5px; color: var(--ink); background: var(--bg);
  border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; width: 100%;
}
.pf textarea { resize: vertical; min-height: 76px; }
.pf textarea.tall { min-height: 240px; font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; }
.pf .check { display: flex; gap: 8px; align-items: center; margin-top: 16px; }
.pf .check input { width: auto; }
.pf .save {
  position: sticky; bottom: 0; background: var(--bg); padding: 14px 0 4px;
  margin-top: 22px; border-top: 1px solid var(--line);
}
"""


def _field(profile: CandidateProfile, name: str, label: str, kind: str, help_text: str) -> str:
    value = getattr(profile, name, None)
    head = (
        f'<span class="name">{escape(label)}</span>'
        f'<div class="help">{escape(help_text)}</div>'
    )

    if kind == "bool":
        checked = " checked" if value else ""
        return (
            f'<label class="check"><input type="checkbox" name="{name}" value="1"{checked}>'
            f"<span>{head}</span></label>"
        )
    if kind == "lines":
        body = escape("\n".join(str(v) for v in (value or [])))
        return f'<label>{head}<textarea name="{name}" rows="4">{body}</textarea></label>'
    if kind == "longtext":
        joined = "\n\n".join(value) if isinstance(value, list) else (value or "")
        return f'<label>{head}<textarea name="{name}" class="tall">{escape(str(joined))}</textarea></label>'
    if kind == "int":
        shown = "" if value in (None, "") else escape(str(value))
        return f'<label>{head}<input type="number" name="{name}" value="{shown}"></label>'
    return f'<label>{head}<input type="text" name="{name}" value="{escape(str(value or ""))}"></label>'


def render(profile: CandidateProfile, saved: bool = False, error: str = "") -> str:
    """The editor page."""
    flash = ""
    if error:
        flash = f'<div class="flash err">{escape(error)}</div>'
    elif saved:
        flash = (
            '<div class="flash ok">Profile saved. Because the profile changed, jobs '
            "previously skipped will be judged again on the next run.</div>"
        )

    fields = "".join(_field(profile, *f) for f in FIELDS)
    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>Career Agent &mdash; profile</title>"
        f"<style>{_BASE_STYLE}{_STYLE}</style></head><body><div class='wrap'>"
        "<h1>Your profile</h1>"
        '<div class="sub">What the agent reads when judging postings and writing resumes. '
        "Saved to Firestore, not the file.</div>"
        '<div class="tabs"><a class="tab" href="/">&larr; Back to jobs</a></div>'
        f"{flash}"
        f'<form class="pf" method="post" action="/profile">{fields}'
        '<div class="save"><button class="act" type="submit">Save profile</button></div>'
        "</form></div></body></html>"
    )
