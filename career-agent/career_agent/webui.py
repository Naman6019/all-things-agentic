"""Server-rendered review UI for the jobs the agent has processed.

Deliberately a single self-contained HTML string with no template engine, no
build step and no external assets: it ships inside the same Cloud Run service
as the pipeline, so there is nothing extra to deploy or keep in sync, and it
still renders if the network is locked down during a demo.

Read-only by design. The agent drafts and finds; a human opens the JD link and
decides. Nothing here submits an application.
"""
from __future__ import annotations

from html import escape

from .storage import firestore_store

_STYLE = """
:root {
  --bg: #fbfaf9; --panel: #fff; --ink: #1a1a18; --muted: #6b6a67;
  --line: #e6e3df; --accent: #2f6f4f; --warn: #8a6d1f; --bad: #9b4a3f;
  --chip: #f1efec;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16161a; --panel: #1e1e23; --ink: #eceaf0; --muted: #a09daa;
    --line: #2e2e36; --accent: #7fc4a0; --warn: #d9bc72; --bad: #e0938a;
    --chip: #26262e;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.55 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.wrap { max-width: 900px; margin: 0 auto; padding: 32px 20px 64px; }
h1 { font-size: 21px; margin: 0 0 4px; letter-spacing: -0.01em; }
.sub { color: var(--muted); font-size: 13px; margin-bottom: 20px; }
.tabs { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
.tab {
  padding: 6px 14px; border: 1px solid var(--line); border-radius: 999px;
  text-decoration: none; color: var(--muted); font-size: 13px; background: var(--panel);
}
.tab.on { color: var(--bg); background: var(--ink); border-color: var(--ink); }
.card {
  background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  padding: 16px 18px; margin-bottom: 12px;
}
.top { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; flex-wrap: wrap; }
.title { font-weight: 600; font-size: 16px; }
.co { color: var(--muted); font-size: 13px; }
.jd {
  font-size: 13px; text-decoration: none; color: var(--bg); background: var(--accent);
  padding: 5px 12px; border-radius: 6px; white-space: nowrap; font-weight: 500;
}
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 0; }
.chip {
  font-size: 11.5px; color: var(--muted); background: var(--chip);
  padding: 2px 9px; border-radius: 999px;
}
.why { margin: 12px 0 0; font-size: 14px; }
.lab {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--muted); margin: 14px 0 5px; font-weight: 600;
}
ul { margin: 0; padding-left: 18px; }
li { margin-bottom: 3px; font-size: 13.5px; }
li.warn { color: var(--warn); }
li.bad { color: var(--bad); }
details { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; }
summary { cursor: pointer; font-size: 13px; color: var(--muted); }
pre {
  white-space: pre-wrap; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--bg); border: 1px solid var(--line); border-radius: 6px;
  padding: 12px; margin: 10px 0 0; overflow-x: auto;
}
.empty { color: var(--muted); text-align: center; padding: 48px 0; }
.add { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
       padding: 14px 16px; margin-bottom: 20px; }
.add summary { font-size: 13.5px; color: var(--ink); font-weight: 500; }
.add details { border: 0; margin: 0; padding: 0; }
.add .row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.add input, .add textarea {
  font: inherit; font-size: 13.5px; color: var(--ink); background: var(--bg);
  border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; width: 100%;
}
.add input { flex: 1 1 180px; width: auto; }
.add textarea { margin-top: 8px; min-height: 96px; resize: vertical; }
.add button {
  font: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer; margin-top: 10px;
  color: var(--bg); background: var(--ink); border: 0; border-radius: 6px; padding: 8px 16px;
}
.add .hint { color: var(--muted); font-size: 12.5px; margin-top: 8px; }
.flash { border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 13.5px; }
.flash.ok { background: var(--chip); color: var(--accent); }
.flash.err { background: var(--chip); color: var(--bad); }
.stats { color: var(--muted); font-size: 12.5px; border-top: 1px solid var(--line);
         margin-top: 28px; padding-top: 14px; }
"""

_STATUS_TABS = [
    ("matched", "Matched", ["matched", "drafted"]),
    ("skipped", "Skipped", ["skipped"]),
]


def _chips(app: dict) -> str:
    bits = [b for b in (app.get("location"), app.get("source")) if b]
    if app.get("remote"):
        bits.append("remote")
    if app.get("contact_email"):
        # Confidence is shown, not just the source: a medium/low address is a
        # lead to check, and presenting it as settled is how someone emails an
        # accessibility desk with a cover letter.
        confidence = app.get("contact_confidence")
        label = f"{app['contact_email']} ({app.get('contact_source', '?')}"
        label += f", {confidence} confidence)" if confidence else ")"
        bits.append(label)
    return "".join(f'<span class="chip">{escape(str(b))}</span>' for b in bits)


def _list(items: list, css: str) -> str:
    return "".join(f'<li class="{css}">{escape(str(i))}</li>' for i in items)


def _card(app: dict) -> str:
    url = app.get("url") or ""
    link = (
        f'<a class="jd" href="{escape(url)}" target="_blank" rel="noopener">Open JD &rarr;</a>'
        if url
        else '<span class="chip">no JD link</span>'
    )
    parts = [
        '<div class="card">',
        '<div class="top"><div>',
        f'<div class="title">{escape(str(app.get("title") or "Untitled"))}</div>',
        f'<div class="co">{escape(str(app.get("company") or ""))}</div>',
        f"</div>{link}</div>",
        f'<div class="chips">{_chips(app)}</div>',
    ]

    if app.get("reasoning"):
        parts.append(f'<div class="why">{escape(str(app["reasoning"]))}</div>')

    if app.get("unmet_requirements"):
        parts.append('<div class="lab">Requirements you do not meet</div>')
        parts.append(f'<ul>{_list(app["unmet_requirements"], "bad")}</ul>')

    if app.get("missing_information"):
        parts.append('<div class="lab">Not stated in the posting &mdash; verify</div>')
        parts.append(f'<ul>{_list(app["missing_information"], "warn")}</ul>')

    if app.get("tailored_resume_summary") or app.get("cover_letter"):
        parts.append("<details><summary>Drafted application materials</summary>")
        if app.get("tailored_resume_summary"):
            parts.append('<div class="lab">Tailored resume bullets</div>')
            parts.append(f'<pre>{escape(str(app["tailored_resume_summary"]))}</pre>')
        if app.get("cover_letter"):
            parts.append('<div class="lab">Cover letter</div>')
            parts.append(f'<pre>{escape(str(app["cover_letter"]))}</pre>')
        parts.append("</details>")

    parts.append("</div>")
    return "".join(parts)


def _stats(summary: dict) -> str:
    if not summary:
        return ""
    filtered = sum((summary.get("filtered_out") or {}).values())
    line = (
        f"Last run fetched {summary.get('fetched', 0)} postings, "
        f"{summary.get('relevant_after_prefilter', 0)} matched a target title, "
        f"{summary.get('taken_this_run', 0)} were evaluated. "
        f"{filtered} were set aside on title before any model call"
    )
    deferred = summary.get("deferred_to_next_run", 0)
    if deferred:
        line += f", and {deferred} relevant postings are queued for the next run"
    errors = summary.get("source_errors") or {}
    if errors:
        line += f". Sources that failed: {', '.join(errors)}"
    line += "."

    tokens = summary.get("tokens") or {}
    if tokens.get("total"):
        line += (
            f" It used {tokens['total']:,} tokens "
            f"({tokens.get('input', 0):,} in, {tokens.get('output', 0):,} out, "
            f"{tokens.get('thoughts', 0):,} thinking), "
            f"costing about ${summary.get('cost_usd', 0):.3f}. Billing is in INR at your "
            "account's conversion rate."
        )
        models = summary.get("models") or {}
        if models:
            line += (
                f" Evaluation ran on {models.get('evaluator', '?')}, "
                f"drafting on {models.get('drafter', '?')}"
            )
            # Per-model split is the point of running two: without it you cannot
            # tell whether a cheap evaluator actually paid off.
            per_model = summary.get("cost_by_model") or {}
            if len(per_model) > 1:
                split = ", ".join(f"{m} ${c:.3f}" for m, c in sorted(per_model.items()))
                line += f" ({split})"
            line += "."
        unpriced = summary.get("unpriced_models") or []
        if unpriced:
            line += (
                f" Note: no price is configured for {', '.join(unpriced)}, "
                "so this figure uses a fallback rate and may be wrong."
            )
    return f'<div class="stats">{escape(line)}</div>'


_QUICK_ADD_FORM = """
<div class="add"><details><summary>+ Add a posting you found yourself</summary>
<form method="post" action="/quick-add">
  <div class="row">
    <input name="url" placeholder="Posting URL (optional)" />
    <input name="title" placeholder="Job title (optional)" />
    <input name="company" placeholder="Company (optional)" />
  </div>
  <textarea name="text" placeholder="Paste the posting text here."></textarea>
  <div class="hint">
    Greenhouse, Lever and Ashby links are fetched automatically from their public APIs,
    so a URL alone is enough. For LinkedIn, Indeed, Glassdoor or Wellfound, paste the
    text &mdash; this agent will not fetch those pages, because automated retrieval
    there puts your account at risk. The URL is still saved as the link to apply from.
  </div>
  <button type="submit">Queue for next run</button>
</form></details></div>
"""


def _flash(queued: bool, error: str) -> str:
    if error:
        return f'<div class="flash err">{escape(error)}</div>'
    if queued:
        return (
            '<div class="flash ok">Queued. It will be evaluated on the next run '
            "(POST /run), ahead of the feed results and without title filtering.</div>"
        )
    return ""


def render(status: str = "matched", queued: bool = False, error: str = "") -> str:
    """Renders the review page for one status tab."""
    active = next((t for t in _STATUS_TABS if t[0] == status), _STATUS_TABS[0])
    apps = firestore_store.get_applications_by_status(active[2])
    summary = firestore_store.get_latest_run_summary()

    tabs = "".join(
        f'<a class="tab{" on" if key == active[0] else ""}" href="/?status={key}">{escape(label)}</a>'
        for key, label, _ in _STATUS_TABS
    )
    body = (
        "".join(_card(a) for a in apps)
        if apps
        else f'<div class="empty">No {escape(active[0])} jobs yet. Trigger a run with POST /run.</div>'
    )

    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>Career Agent &mdash; job review</title>"
        f"<style>{_STYLE}</style></head><body><div class='wrap'>"
        "<h1>Career Agent</h1>"
        f'<div class="sub">{len(apps)} {escape(active[1].lower())} '
        "&middot; the agent drafts and finds; you open the JD and decide</div>"
        f'<div class="tabs">{tabs}</div>'
        f"{_flash(queued, error)}{_QUICK_ADD_FORM}"
        f"{body}{_stats(summary)}"
        "</div></body></html>"
    )
