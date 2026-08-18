"""Opt-in ingestion from public company career portals.

No adapter logs in, bypasses access controls, or calls recruiter-only APIs.
Workable uses its documented public published-jobs endpoint. Workday uses only
an explicitly configured external CXS careers endpoint. Other vendors are
accepted through employer-published RSS/Atom, sitemap, JSON feed, or
schema.org JobPosting data.
"""
from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import json
import socket
from html.parser import HTMLParser
from urllib.parse import urlparse
from xml.etree import ElementTree

import httpx

from ..models import JobListing
from .text_utils import clean_description

PORTAL_PROVIDERS = {"workable", "workday", "oracle", "successfactors", "icims", "taleo", "feed"}
WORKABLE_PUBLIC_URL = "https://www.workable.com/api/accounts/{slug}?details=true"
_MAX_RESPONSE_BYTES = 5_000_000
_MAX_REDIRECTS = 5


def _is_public_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
        or address.is_unspecified
        or address.is_multicast
    )


def is_safe_public_url(value: str) -> bool:
    """Reject obvious local/private targets before any model-proposed fetch.

    Syntax only, so it stays usable from synchronous code. It cannot tell that
    an ordinary-looking hostname points at internal space -- assert_public_host
    is what actually gates a fetch.
    """
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or not host or host == "localhost" or host.endswith(".local"):
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return True
    return _is_public_address(address)


async def assert_public_host(url: str) -> None:
    """Resolve the host and refuse any answer that lands in private space.

    The syntactic check above passes anything that is merely a hostname, so on
    its own it admits `https://internal-service.corp/` -- and these URLs can
    come from a Board Scout model proposal rather than from an operator. A
    rebind between this lookup and the connection is still possible; pinning
    the resolved address would mean replacing httpx's transport, which is not
    worth it for a read-only GET whose body is parsed as job postings.
    """
    if not is_safe_public_url(url):
        raise ValueError("Company portal URL must be a public HTTPS URL.")

    host = (urlparse(url).hostname or "").lower().rstrip(".")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        return  # A literal address; is_safe_public_url already cleared it.

    try:
        infos = await asyncio.get_running_loop().getaddrinfo(
            host, 443, type=socket.SOCK_STREAM
        )
    except socket.gaierror:
        # A name that does not resolve cannot reach anything, so there is
        # nothing to block. Let the connection fail as an ordinary source
        # error, which is also what keeps mocked transports testable.
        return

    for info in infos:
        address = ipaddress.ip_address(info[4][0].split("%", 1)[0])
        if not _is_public_address(address):
            raise ValueError(f"Company portal host resolves to a non-public address: {host}")


def portal_source(portal: dict) -> str:
    return f"{portal['provider']}:{portal['slug']}"


def _stable_id(*values: object) -> str:
    payload = "\x1f".join(str(value or "") for value in values)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:20]


def _location_text(value) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return " · ".join(part for item in value if (part := _location_text(item)))
    if not isinstance(value, dict):
        return ""
    if value.get("location_str"):
        return str(value["location_str"]).strip()
    address = value.get("address") if isinstance(value.get("address"), dict) else value
    return ", ".join(
        str(address.get(key) or "").strip()
        for key in ("addressLocality", "city", "addressRegion", "region", "addressCountry", "country")
        if str(address.get(key) or "").strip()
    )


def _organization_name(value, fallback: str) -> str:
    if isinstance(value, dict):
        return str(value.get("name") or fallback)
    return fallback


def _schema_job(payload: dict, portal: dict, page_url: str) -> JobListing | None:
    kind = payload.get("@type")
    kinds = {str(item).casefold() for item in (kind if isinstance(kind, list) else [kind])}
    if "jobposting" not in kinds:
        return None
    title = str(payload.get("title") or "").strip()
    url = str(payload.get("url") or page_url).strip()
    if not title or not url:
        return None
    location = _location_text(payload.get("jobLocation"))
    if not location:
        location = _location_text(payload.get("applicantLocationRequirements"))
    remote = str(payload.get("jobLocationType") or "").upper() == "TELECOMMUTE"
    identifier = payload.get("identifier")
    if isinstance(identifier, dict):
        identifier = identifier.get("value") or identifier.get("name")
    external_id = str(identifier or _stable_id(url, title))
    return JobListing(
        job_id=f"{portal_source(portal)}:{external_id}",
        source=portal_source(portal),
        title=title,
        company=_organization_name(payload.get("hiringOrganization"), portal["company"]),
        location=location or ("Remote" if remote else ""),
        remote=remote or "remote" in location.casefold(),
        url=url,
        description=clean_description(str(payload.get("description") or "")),
        posted_at=payload.get("datePosted"),
    )


def _walk_json(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk_json(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_json(child)


class _JsonLdParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._inside = False
        self._chunks: list[str] = []
        self.documents: list[object] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        attributes = {key.casefold(): (value or "") for key, value in attrs}
        if tag.casefold() == "script" and "ld+json" in attributes.get("type", "").casefold():
            self._inside = True
            self._chunks = []

    def handle_data(self, data: str) -> None:
        if self._inside:
            self._chunks.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.casefold() != "script" or not self._inside:
            return
        self._inside = False
        try:
            self.documents.append(json.loads("".join(self._chunks)))
        except json.JSONDecodeError:
            pass


def parse_json_ld(html: str, portal: dict, page_url: str) -> list[JobListing]:
    parser = _JsonLdParser()
    parser.feed(html)
    jobs = []
    seen: set[str] = set()
    for document in parser.documents:
        for item in _walk_json(document):
            job = _schema_job(item, portal, page_url)
            if job and job.job_id not in seen:
                jobs.append(job)
                seen.add(job.job_id)
    return jobs


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].casefold()


def _child_text(element, *names: str) -> str:
    wanted = {name.casefold() for name in names}
    for child in element.iter():
        if _local_name(child.tag) in wanted and (child.text or "").strip():
            return (child.text or "").strip()
    return ""


def parse_feed(xml: bytes, portal: dict) -> tuple[list[JobListing], list[str]]:
    """Return feed jobs, or sitemap URLs that need bounded detail reads."""
    root = ElementTree.fromstring(xml)
    root_name = _local_name(root.tag)
    if root_name in {"urlset", "sitemapindex"}:
        return [], [
            (element.text or "").strip()
            for element in root.iter()
            if _local_name(element.tag) == "loc" and (element.text or "").strip()
        ]

    entries = [item for item in root.iter() if _local_name(item.tag) in {"item", "entry"}]
    jobs = []
    for entry in entries:
        title = _child_text(entry, "title")
        link = _child_text(entry, "link", "guid", "id")
        if not link:
            link_element = next((item for item in entry.iter() if _local_name(item.tag) == "link"), None)
            link = (link_element.attrib.get("href") if link_element is not None else "") or ""
        if not title or not link:
            continue
        description = _child_text(entry, "encoded", "content", "description", "summary")
        location = _child_text(entry, "location", "joblocation")
        external_id = _child_text(entry, "guid", "id") or _stable_id(link, title)
        jobs.append(
            JobListing(
                job_id=f"{portal_source(portal)}:{_stable_id(external_id)}",
                source=portal_source(portal),
                title=title,
                company=portal["company"],
                location=location,
                remote="remote" in location.casefold(),
                url=link,
                description=clean_description(description),
                posted_at=_child_text(entry, "pubdate", "published", "updated", "date"),
            )
        )
    return jobs, []


def _generic_json_jobs(payload, portal: dict, page_url: str) -> list[JobListing]:
    jobs: list[JobListing] = []
    seen: set[str] = set()
    for item in _walk_json(payload):
        job = _schema_job(item, portal, page_url)
        if job is None and item.get("title") and (item.get("url") or item.get("external_url")):
            url = str(item.get("url") or item.get("external_url"))
            external_id = item.get("id") or item.get("guid") or _stable_id(url, item.get("title"))
            location = _location_text(item.get("location"))
            job = JobListing(
                job_id=f"{portal_source(portal)}:{_stable_id(external_id)}",
                source=portal_source(portal),
                title=str(item["title"]),
                company=str(item.get("company") or portal["company"]),
                location=location,
                remote=bool(item.get("remote")) or "remote" in location.casefold(),
                url=url,
                description=clean_description(str(item.get("content_html") or item.get("description") or "")),
                posted_at=item.get("date_published") or item.get("datePosted") or item.get("published_at"),
            )
        if job and job.job_id not in seen:
            jobs.append(job)
            seen.add(job.job_id)
    return jobs


async def _get(client: httpx.AsyncClient, url: str) -> httpx.Response:
    """Fetch a portal URL, checking every hop instead of only the last one.

    Redirects are followed by hand because the client-level follow_redirects
    would already have issued the request to an internal host by the time the
    final URL could be inspected -- which is exactly the hop worth blocking.
    """
    target = url
    for _ in range(_MAX_REDIRECTS + 1):
        await assert_public_host(target)
        response = await client.get(target, timeout=25, follow_redirects=False)
        if not response.is_redirect:
            response.raise_for_status()
            if len(response.content) > _MAX_RESPONSE_BYTES:
                raise ValueError("Company portal response exceeded 5 MB.")
            return response
        if response.next_request is None:
            raise ValueError("Company portal returned a redirect without a location.")
        target = str(response.next_request.url)
    raise ValueError(f"Company portal exceeded {_MAX_REDIRECTS} redirects.")


async def fetch_workable(portal: dict, client: httpx.AsyncClient) -> list[JobListing]:
    response = await _get(client, WORKABLE_PUBLIC_URL.format(slug=portal["slug"]))
    payload = response.json()
    raw_jobs = payload.get("jobs", payload if isinstance(payload, list) else [])
    jobs = []
    for item in raw_jobs:
        if item.get("state") not in (None, "published"):
            continue
        location = _location_text(item.get("location")) or str(item.get("location_str") or "")
        location_data = item.get("location") if isinstance(item.get("location"), dict) else {}
        external_id = item.get("id") or item.get("shortcode")
        if not external_id or not item.get("title"):
            continue
        jobs.append(
            JobListing(
                job_id=f"{portal_source(portal)}:{external_id}",
                source=portal_source(portal),
                title=str(item["title"]),
                company=portal["company"],
                location=location,
                remote=bool(location_data.get("telecommuting"))
                or str(location_data.get("workplace_type") or "").casefold() == "remote"
                or "remote" in location.casefold(),
                url=str(item.get("shortlink") or item.get("application_url") or item.get("url") or ""),
                description=clean_description(str(item.get("description") or item.get("full_description") or "")),
                posted_at=item.get("created_at"),
            )
        )
    return jobs


async def fetch_workday(portal: dict, client: httpx.AsyncClient, detail_limit: int) -> list[JobListing]:
    base = portal["url"].rstrip("/")
    if "/wday/cxs/" not in base:
        raise ValueError("Workday URL must be an external /wday/cxs/<tenant>/<site> endpoint.")
    await assert_public_host(base)
    response = await client.post(
        f"{base}/jobs",
        json={"appliedFacets": {}, "limit": min(detail_limit, 20), "offset": 0, "searchText": ""},
        timeout=25,
        follow_redirects=False,
    )
    if response.is_redirect:
        raise ValueError("Workday search endpoint redirected; configure the external CXS URL.")
    response.raise_for_status()
    if len(response.content) > _MAX_RESPONSE_BYTES:
        raise ValueError("Workday returned an oversized response.")
    postings = response.json().get("jobPostings", [])[:detail_limit]

    async def detail(posting: dict) -> JobListing | None:
        path = str(posting.get("externalPath") or "")
        if not path.startswith("/"):
            return None
        detail_response = await _get(client, f"{base}{path}")
        info = detail_response.json().get("jobPostingInfo", {})
        title = str(info.get("title") or posting.get("title") or "").strip()
        if not title:
            return None
        location = str(info.get("location") or posting.get("locationsText") or "")
        external_id = info.get("jobReqId") or info.get("id") or _stable_id(path)
        human_base = str(portal.get("careers_url") or "").rstrip("/")
        human_url = str(info.get("externalUrl") or (f"{human_base}{path}" if human_base else ""))
        return JobListing(
            job_id=f"{portal_source(portal)}:{external_id}",
            source=portal_source(portal),
            title=title,
            company=portal["company"],
            location=location,
            remote="remote" in location.casefold(),
            url=human_url,
            description=clean_description(str(info.get("jobDescription") or "")),
            posted_at=info.get("startDate") or posting.get("postedOn"),
        )

    results = await asyncio.gather(*(detail(item) for item in postings), return_exceptions=True)
    jobs = [item for item in results if isinstance(item, JobListing)]
    if postings and not jobs and any(isinstance(item, BaseException) for item in results):
        raise RuntimeError("Workday returned postings but every detail request failed.")
    return jobs


async def fetch_public_document(portal: dict, client: httpx.AsyncClient, detail_limit: int) -> list[JobListing]:
    response = await _get(client, portal["url"])
    content_type = response.headers.get("content-type", "").casefold()
    if "json" in content_type:
        return _generic_json_jobs(response.json(), portal, str(response.url))
    if "xml" in content_type or response.content.lstrip().startswith(b"<?xml"):
        jobs, links = parse_feed(response.content, portal)
        if jobs:
            return jobs
        queue = [(link, 0) for link in links if is_safe_public_url(link)]
        collected: list[JobListing] = []
        fetched = 0
        failures = 0
        while queue and fetched < detail_limit:
            batch = queue[: min(10, detail_limit - fetched)]
            queue = queue[len(batch) :]
            pages = await asyncio.gather(*(_get(client, url) for url, _ in batch), return_exceptions=True)
            fetched += len(batch)
            for (url, depth), page in zip(batch, pages):
                if not isinstance(page, httpx.Response):
                    failures += 1
                    continue
                page_type = page.headers.get("content-type", "").casefold()
                if "xml" in page_type or page.content.lstrip().startswith(b"<?xml"):
                    feed_jobs, nested = parse_feed(page.content, portal)
                    collected.extend(feed_jobs)
                    if depth < 1:
                        queue.extend((link, depth + 1) for link in nested if is_safe_public_url(link))
                else:
                    collected.extend(parse_json_ld(page.text, portal, str(page.url)))
        if links and not collected and failures:
            raise RuntimeError("Public career sitemap was readable but its job pages failed.")
        return collected
    return parse_json_ld(response.text, portal, str(response.url))


async def fetch_portal(portal: dict, client: httpx.AsyncClient, detail_limit: int = 25) -> list[JobListing]:
    provider = portal["provider"]
    if provider == "workable":
        return await fetch_workable(portal, client)
    if provider == "workday":
        return await fetch_workday(portal, client, detail_limit)
    return await fetch_public_document(portal, client, detail_limit)
