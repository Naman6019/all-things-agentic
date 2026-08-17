from __future__ import annotations

import json

import httpx
import pytest

from career_agent import config
from career_agent.sources import company_portals


def portal(provider: str = "feed", **changes) -> dict:
    value = {
        "provider": provider,
        "slug": "acme",
        "company": "Acme",
        "url": "https://careers.acme.example/jobs.xml",
        "careers_url": "https://careers.acme.example",
    }
    value.update(changes)
    return value


def test_company_portal_config_requires_explicit_supported_sources():
    parsed = config._company_portals(json.dumps([
        {"provider": "workable", "company": "Acme", "slug": "acme"},
        {"provider": "oracle", "company": "Big Co", "url": "https://jobs.big.example/sitemap.xml"},
    ]))

    assert [item["provider"] for item in parsed] == ["workable", "oracle"]
    assert parsed[1]["slug"]

    with pytest.raises(ValueError, match="supported provider"):
        config._company_portals('[{"provider":"linkedin","company":"Nope","url":"https://example.com"}]')


def test_json_ld_preserves_company_location_description_and_application_url():
    html = '''
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"JobPosting","identifier":{"value":"REQ-7"},
     "title":"Machine Learning Engineer","description":"<p>Build ranking models.</p>",
     "datePosted":"2026-08-17","url":"https://acme.example/jobs/7",
     "hiringOrganization":{"name":"Acme AI"},
     "jobLocation":[{"address":{"addressLocality":"Bengaluru","addressCountry":"India"}},
                    {"address":{"addressLocality":"Pune","addressCountry":"India"}}]}
    </script>'''

    jobs = company_portals.parse_json_ld(html, portal("oracle"), "https://acme.example/jobs/7")

    assert len(jobs) == 1
    assert jobs[0].job_id == "oracle:acme:REQ-7"
    assert jobs[0].company == "Acme AI"
    assert jobs[0].location == "Bengaluru, India · Pune, India"
    assert jobs[0].description == "Build ranking models."
    assert jobs[0].url == "https://acme.example/jobs/7"


def test_rss_feed_maps_entries_without_following_pages():
    xml = b'''<?xml version="1.0"?><rss><channel><item>
      <guid>42</guid><title>AI Engineer</title><link>https://acme.example/jobs/42</link>
      <description><![CDATA[<p>Build agents.</p>]]></description><location>Remote - India</location>
      <pubDate>2026-08-17T00:00:00Z</pubDate>
    </item></channel></rss>'''

    jobs, links = company_portals.parse_feed(xml, portal("successfactors"))

    assert links == []
    assert len(jobs) == 1
    assert jobs[0].remote is True
    assert jobs[0].description == "Build agents."


@pytest.mark.asyncio
async def test_sitemap_fetches_bounded_jobposting_pages():
    sitemap = b'''<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://careers.acme.example/jobs/one</loc></url>
      <url><loc>https://careers.acme.example/jobs/two</loc></url>
    </urlset>'''

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/jobs.xml":
            return httpx.Response(200, content=sitemap, headers={"content-type": "application/xml"})
        name = request.url.path.rsplit("/", 1)[-1]
        html = f'''<script type="application/ld+json">{{"@type":"JobPosting","title":"{name.title()} Engineer","url":"{request.url}","description":"Build systems"}}</script>'''
        return httpx.Response(200, text=html, headers={"content-type": "text/html"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        jobs = await company_portals.fetch_public_document(portal(), client, detail_limit=2)

    assert [job.title for job in jobs] == ["One Engineer", "Two Engineer"]
    assert [job.url for job in jobs] == [
        "https://careers.acme.example/jobs/one",
        "https://careers.acme.example/jobs/two",
    ]


@pytest.mark.asyncio
async def test_workable_uses_public_published_jobs_and_keeps_apply_link():
    payload = {"jobs": [
        {"id": "1", "title": "ML Engineer", "state": "published", "shortlink": "https://apply.workable.com/j/ONE", "description": "Build ML", "location": {"location_str": "Remote - India", "telecommuting": True}},
        {"id": "2", "title": "Private Role", "state": "draft", "shortlink": "https://apply.workable.com/j/TWO"},
    ]}

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        jobs = await company_portals.fetch_workable(portal("workable", url=""), client)

    assert len(jobs) == 1
    assert jobs[0].location == "Remote - India"
    assert jobs[0].url == "https://apply.workable.com/j/ONE"


@pytest.mark.asyncio
async def test_workday_reads_external_career_results_and_details_only():
    base = "https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External"

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(200, json={"jobPostings": [{"title": "AI Engineer", "externalPath": "/job/India/AI-Engineer_R7", "locationsText": "Bengaluru"}]})
        return httpx.Response(200, json={"jobPostingInfo": {
            "jobReqId": "R7", "title": "AI Engineer", "location": "Bengaluru, India",
            "jobDescription": "<p>Build AI products.</p>",
            "externalUrl": "https://acme.wd5.myworkdayjobs.com/en-US/External/job/India/AI-Engineer_R7",
            "startDate": "2026-08-17",
        }})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        jobs = await company_portals.fetch_workday(
            portal("workday", url=base, careers_url="https://acme.wd5.myworkdayjobs.com/en-US/External"),
            client,
            detail_limit=5,
        )

    assert len(jobs) == 1
    assert jobs[0].job_id == "workday:acme:R7"
    assert jobs[0].description == "Build AI products."
    assert jobs[0].url.endswith("AI-Engineer_R7")


def test_rejects_local_or_non_https_portal_targets():
    assert company_portals.is_safe_public_url("https://careers.example.com/jobs") is True
    assert company_portals.is_safe_public_url("http://careers.example.com/jobs") is False
    assert company_portals.is_safe_public_url("https://127.0.0.1/jobs") is False
    assert company_portals.is_safe_public_url("https://169.254.169.254/latest/meta-data") is False


@pytest.mark.asyncio
async def test_blocks_hosts_that_resolve_into_private_space(monkeypatch):
    """A hostname is not evidence of a public target, and these URLs can come
    from a Board Scout model proposal rather than from an operator."""
    monkeypatch.setattr(
        company_portals.socket, "gaierror", OSError, raising=False
    )

    async def fake_getaddrinfo(host, port, **kwargs):
        return [(2, 1, 6, "", ("10.4.2.9", port))]

    class Loop:
        getaddrinfo = staticmethod(fake_getaddrinfo)

    monkeypatch.setattr(company_portals.asyncio, "get_running_loop", lambda: Loop())

    with pytest.raises(ValueError, match="non-public address"):
        await company_portals.assert_public_host("https://internal-careers.corp/jobs.xml")


@pytest.mark.asyncio
async def test_redirect_into_private_space_is_blocked_before_the_request():
    """The hop matters, not the final URL: following it first is the leak."""
    reached: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        reached.append(str(request.url))
        return httpx.Response(302, headers={"location": "https://127.0.0.1/admin"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError, match="public HTTPS URL"):
            await company_portals._get(client, "https://careers.acme.example/jobs.xml")

    assert reached == ["https://careers.acme.example/jobs.xml"]


@pytest.mark.asyncio
async def test_redirect_loop_is_bounded():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "https://careers.acme.example/again"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError, match="redirects"):
            await company_portals._get(client, "https://careers.acme.example/jobs.xml")
