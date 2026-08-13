"""Evidence about the candidate, beyond what their resume says.

A resume is a summary the candidate wrote months ago. Their public work is
current and specific -- exact repository names, languages, and what each
project actually does. Feeding that to the drafter lets a tailored resume cite
a real project matching the posting's stack instead of restating the same
paragraph every time.

Why GitHub and not LinkedIn:

  GitHub publishes a public REST API intended for exactly this. LinkedIn does
  not. Its API is partner-gated and "Sign In with LinkedIn" returns only name,
  email and photo -- never employment history -- while scraping profiles is
  prohibited by the User Agreement. That is the same rule that keeps LinkedIn
  out of the job sources, and it does not change because the profile belongs
  to our own user. The lawful route for LinkedIn data is the member's own
  export (Settings -> Get a copy of your data), which is a file the user
  uploads, not something this code fetches.

Fetched on a slow cadence and cached, unlike job listings: a person's public
work changes weekly at most, and re-fetching per job would mean one GitHub
request per evaluated posting against a 60/hour unauthenticated limit.
"""
from __future__ import annotations

import base64
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

import httpx

GITHUB_API = "https://api.github.com"

# Enough to characterise a project without pasting its whole manual.
_README_CHARS = 900
_MARKDOWN_NOISE = re.compile(r"(?m)^\s*(?:!\[[^\]]*\]\([^)]*\)\s*)+$|^\s*[-=*_]{3,}\s*$|^\s*#+\s*")
_BADGE_LINE = re.compile(r"(?m)^.*\[!\[.*$")
_WS = re.compile(r"\n{3,}")


@dataclass
class PublicRepo:
    name: str
    description: str
    language: str
    topics: list[str]
    stars: int
    pushed_at: str
    url: str
    readme_excerpt: str = ""


@dataclass
class GithubProfile:
    username: str
    name: str = ""
    bio: str = ""
    location: str = ""
    public_repos: int = 0
    repos: list[PublicRepo] = field(default_factory=list)
    fetched_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    error: str = ""


def _clean_readme(markdown: str) -> str:
    """Strips badges and heading noise; keeps the prose that says what it does."""
    text = _BADGE_LINE.sub("", markdown or "")
    text = _MARKDOWN_NOISE.sub("", text)
    text = _WS.sub("\n\n", text).strip()
    return text[:_README_CHARS]


async def _readme(client: httpx.AsyncClient, username: str, repo: str) -> str:
    """A repo's README, or empty when it has none. Never raises.

    Most of these repos have no description, so the README is the only thing
    that says what the project is -- and a failure to read one must not sink
    the whole enrichment.
    """
    try:
        resp = await client.get(f"{GITHUB_API}/repos/{username}/{repo}/readme", timeout=15)
        if resp.status_code != 200:
            return ""
        content = resp.json().get("content", "")
        return _clean_readme(base64.b64decode(content).decode("utf-8", errors="replace"))
    except Exception:  # noqa: BLE001 - enrichment is best-effort by design
        return ""


async def fetch_github(
    username: str, client: httpx.AsyncClient, max_repos: int = 12, token: str = ""
) -> GithubProfile:
    """Public profile plus the most recently worked-on original repositories.

    Forks are excluded: they are someone else's project, and presenting them as
    the candidate's work is the kind of overstatement the drafter is instructed
    to avoid everywhere else.

    Returns a profile carrying `error` rather than raising. Enrichment is a
    bonus; a rate limit or an outage must never stop a run from drafting.
    """
    if not username:
        return GithubProfile(username="", error="no github_username in profile")

    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        user_resp = await client.get(f"{GITHUB_API}/users/{username}", headers=headers, timeout=20)
        if user_resp.status_code == 404:
            return GithubProfile(username=username, error="github user not found")
        if user_resp.status_code == 403:
            return GithubProfile(username=username, error="github rate limit reached")
        user_resp.raise_for_status()
        user = user_resp.json()

        repos_resp = await client.get(
            f"{GITHUB_API}/users/{username}/repos",
            params={"per_page": 100, "sort": "pushed"},
            headers=headers,
            timeout=20,
        )
        repos_resp.raise_for_status()
        raw_repos = [r for r in repos_resp.json() if not r.get("fork")][:max_repos]
    except Exception as e:  # noqa: BLE001
        return GithubProfile(username=username, error=f"{type(e).__name__}: {str(e)[:120]}")

    repos = []
    for r in raw_repos:
        repos.append(
            PublicRepo(
                name=r.get("name", ""),
                description=r.get("description") or "",
                language=r.get("language") or "",
                topics=r.get("topics") or [],
                stars=r.get("stargazers_count", 0),
                pushed_at=(r.get("pushed_at") or "")[:10],
                url=r.get("html_url", ""),
                readme_excerpt=await _readme(client, username, r.get("name", "")),
            )
        )

    return GithubProfile(
        username=username,
        name=user.get("name") or "",
        bio=user.get("bio") or "",
        location=user.get("location") or "",
        public_repos=user.get("public_repos", 0),
        repos=repos,
    )


def as_prompt_block(profile: GithubProfile | dict, compact: bool = False) -> str:
    """Renders the profile as text, or '' when there is nothing to say.

    Two sizes because the two stages need different things and cost different
    amounts. The drafter runs once per match and wants detail to write from.
    The evaluator runs once per JOB -- ten times a run -- and only needs enough
    to know a skill is genuinely demonstrated.

    Both keep a README excerpt. Dropping it for the compact form was tempting
    and wrong: most of these repositories have no description at all, so the
    README is the only place the stack is stated, and a bare name tells the
    evaluator nothing.

    Labelled as evidence with a warning either way, because handing the model
    more material about the candidate raises the risk it embellishes -- a repo
    name is not proof of what the repo does.
    """
    data = profile if isinstance(profile, dict) else asdict(profile)
    repos = data.get("repos") or []
    if not repos:
        return ""

    excerpt_chars = 180 if compact else 400

    if compact:
        lines = [
            "PUBLIC WORK (the candidate's real repositories). Skills demonstrated here are",
            "genuine hands-on experience and count toward a posting's requirements, even",
            "when the resume does not mention them. Credit only what is stated below —",
            "a repository name alone proves nothing about what it does.",
            "",
        ]
    else:
        lines = [
            "PUBLIC WORK (from the candidate's GitHub — factual evidence, not resume copy).",
            "Use these to cite concrete projects matching this posting. Describe a repo ONLY",
            "as its description or README states; never infer capability from a name alone.",
            "",
        ]
        if data.get("bio"):
            lines.append(f"bio: {data['bio']}")
        lines.append(f"public repositories: {data.get('public_repos', len(repos))}")
        lines.append("")

    for repo in repos:
        header = f"- {repo.get('name', '')}"
        meta = [
            m
            for m in (
                repo.get("language"),
                f"{repo.get('stars', 0)} stars" if repo.get("stars") else "",
                "" if compact else f"last pushed {repo.get('pushed_at', '')}",
            )
            if m
        ]
        if meta:
            header += f" ({', '.join(meta)})"
        lines.append(header)
        if repo.get("description"):
            lines.append(f"    {repo['description']}")
        if repo.get("topics") and not compact:
            lines.append(f"    topics: {', '.join(repo['topics'])}")
        if repo.get("readme_excerpt"):
            excerpt = " ".join(repo["readme_excerpt"].split())[:excerpt_chars]
            lines.append(f"    {'' if compact else 'readme: '}{excerpt}")
    return "\n".join(lines)
