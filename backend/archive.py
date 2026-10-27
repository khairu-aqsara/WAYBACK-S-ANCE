"""Internet Archive reader: list snapshots, fetch them, strip them to text."""

import asyncio
import re
from collections import OrderedDict
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import httpx

import config

CDX_URL = "https://web.archive.org/cdx/search/cdx"
RAW_URL = "https://web.archive.org/web/{ts}id_/{url}"
USER_AGENT = "wayback-seance/0.1 (Hacktoberfest open-source AI challenge)"

JUNK_MARKERS = (
    "Welcome to the US Petabox",
    "Wayback Machine doesn't have that page archived",
    "Got an HTTP 302 response at crawl time",
    "This URL has been excluded from the Wayback Machine",
)
ASSET_EXT = re.compile(r"\.(png|jpe?g|gif|svg|ico|css|js|pdf|zip|gz|mp3|mp4|swf|xml|rss)$", re.I)


def normalize_url(url: str) -> str:
    """Return host plus path with no scheme, the form the CDX API matches on."""
    url = url.strip()
    if "://" not in url:
        url = "http://" + url
    parts = urlsplit(url)
    path = parts.path if parts.path not in ("", "/") else ""
    return (parts.netloc.lower() + path).rstrip("/")


def slugify(url: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalize_url(url).lower()).strip("-")


def page_key(url: str) -> str:
    """The path of a URL, used as the page name in citations."""
    path = urlsplit(url).path or "/"
    return path if path.startswith("/") else "/" + path


def select_snapshots(rows: list[tuple[str, str]], max_n: int = config.MAX_SNAPSHOTS) -> list[tuple[str, str]]:
    """Pick one snapshot per year, then fill with extra months from the first and last year.

    rows are (timestamp, original) pairs, one per month, in any order.
    """
    rows = sorted(set(rows))
    if not rows:
        return []
    by_year: OrderedDict[str, list[tuple[str, str]]] = OrderedDict()
    for row in rows:
        by_year.setdefault(row[0][:4], []).append(row)

    chosen = [months[0] for months in by_year.values()]
    if len(chosen) > max_n:
        # Too many years: keep the first and last, spread the rest evenly.
        step = (len(chosen) - 1) / (max_n - 1)
        return [chosen[round(i * step)] for i in range(max_n)]

    years = list(by_year)
    extras = by_year[years[-1]][1:][::-1]  # the end of a site's life matters most
    if len(years) > 1:
        extras += by_year[years[0]][1:]
    for row in extras:
        if len(chosen) >= max_n:
            break
        chosen.append(row)
    return sorted(chosen)


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.links: list[str] = []
        self.title = ""
        self._skip = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self._skip:
            self._skip -= 1
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data.strip()
        elif not self._skip and data.strip():
            self.parts.append(" ".join(data.split()))


def extract(html: str) -> tuple[str, str, list[str]]:
    """Return (title, text, hrefs) from an HTML page."""
    parser = _TextExtractor()
    try:
        parser.feed(html)
        parser.close()
    except Exception:  # broken markup from the 1990s still yields partial text
        pass
    return parser.title, " ".join(parser.parts), parser.links


def is_junk(text: str) -> bool:
    if len(text) < config.MIN_TEXT_CHARS:
        return True
    return any(marker in text for marker in JUNK_MARKERS)


def _bare_host(netloc: str) -> str:
    host = netloc.lower().split(":")[0]
    return host[4:] if host.startswith("www.") else host


def brand(url: str) -> str:
    """The longest host label without the TLD: geocities.com gives geocities, del.icio.us gives icio."""
    labels = _bare_host(urlsplit(url if "://" in url else "http://" + url).netloc).split(".")
    return max(labels[:-1] or labels, key=len)


def landed_elsewhere(site_url: str, landed_url: str, title: str, text: str) -> str | None:
    """The foreign host a redirect landed on, or None when the page still belongs to the site.

    A dead site's address often redirects to its new owner. That page is a sign of death, not the
    site's own words, unless it still names the site (Yahoo! GeoCities stays, the Yahoo homepage goes).
    """
    site = urlsplit(site_url if "://" in site_url else "http://" + site_url).netloc
    landed = urlsplit(landed_url).netloc
    if _bare_host(landed) == _bare_host(site) or brand(site_url) in f"{title} {text}".lower():
        return None
    return _bare_host(landed)


def same_host_links(hrefs: list[str], base_url: str, limit: int = config.DEPTH1_MAX_PAGES) -> list[str]:
    """Absolute same-site page links from a page, deduplicated by path, homepage excluded."""
    base = base_url if "://" in base_url else "http://" + base_url
    host = _bare_host(urlsplit(base).netloc)
    seen = {page_key(base)}
    out = []
    for href in hrefs:
        if href.startswith(("#", "mailto:", "javascript:")):
            continue
        absolute = urljoin(base, href)
        parts = urlsplit(absolute)
        if parts.scheme not in ("http", "https") or _bare_host(parts.netloc) != host:
            continue
        if ASSET_EXT.search(parts.path):
            continue
        key = page_key(absolute)
        if key in seen:
            continue
        seen.add(key)
        out.append(absolute.split("#")[0])
        if len(out) >= limit:
            break
    return out


def client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT},
        timeout=httpx.Timeout(30.0),
        follow_redirects=True,
    )


async def _get(http: httpx.AsyncClient, url: str, **kwargs) -> httpx.Response | None:
    for attempt in range(2):
        try:
            response = await http.get(url, **kwargs)
        except httpx.HTTPError:
            response = None
        if response is not None and response.status_code == 200:
            return response
        if response is not None and response.status_code == 404:
            return None
        await asyncio.sleep(2 * (attempt + 1))
    return None


async def list_snapshots(http: httpx.AsyncClient, url: str) -> list[tuple[str, str]]:
    params = {
        "url": normalize_url(url),
        "output": "json",
        "fl": "timestamp,original",
        # Dead sites often answer with redirects; fetch() follows them and is_junk() drops empty landings.
        "filter": ["statuscode:(200|301|302)", "mimetype:text/html"],
        "collapse": "timestamp:6",
    }
    response = await _get(http, CDX_URL, params=params)
    if response is None:
        return []
    rows = response.json()
    return select_snapshots([(ts, original) for ts, original in rows[1:]])


async def fetch(http: httpx.AsyncClient, ts: str, url: str) -> tuple[str, str] | None:
    """Return (html, landed_url): the page and the original URL it came from after redirects."""
    response = await _get(http, RAW_URL.format(ts=ts, url=url))
    if response is None or "html" not in response.headers.get("content-type", "html"):
        return None
    final = str(response.url)
    landed = final.split("id_/", 1)[1] if "id_/" in final else url
    return response.text, landed
