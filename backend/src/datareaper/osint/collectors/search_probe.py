from __future__ import annotations

from urllib.parse import parse_qs, quote_plus, urlparse

import httpx
from bs4 import BeautifulSoup

from datareaper.core.config import get_settings
from datareaper.core.logging import get_logger
from datareaper.integrations.browser.playwright_client import PlaywrightClient

logger = get_logger(__name__)

BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
DDG_LITE_ENGINE = "https://lite.duckduckgo.com/lite/?q={query}"

BLOCKED_HOSTS = {
    "google.com",
    "www.google.com",
    "duckduckgo.com",
    "www.duckduckgo.com",
    "lite.duckduckgo.com",
    "html.duckduckgo.com",
    "bing.com",
    "www.bing.com",
    "yahoo.com",
    "ask.com",
}


def build_search_queries(usernames: list[str], emails: list[str] | None = None) -> list[str]:
    queries: list[str] = []
    seen_queries: set[str] = set()

    for username in usernames[:6]:
        uname = str(username).strip()
        if not uname:
            continue
        for query in (
            f'"{uname}" site:github.com',
            f'"{uname}" site:linkedin.com',
            f'"{uname}" site:twitter.com OR site:x.com',
            f'"{uname}" profile contact',
        ):
            if query not in seen_queries:
                seen_queries.add(query)
                queries.append(query)

    normalized_emails: list[str] = []
    seen_emails: set[str] = set()
    for raw_email in emails or []:
        email = str(raw_email).strip().lower()
        if "@" not in email or email in seen_emails:
            continue
        seen_emails.add(email)
        normalized_emails.append(email)

    for email in normalized_emails[:6]:
        local, domain = email.split("@", 1)
        for query in (
            f'"{email}" site:github.com',
            f'"{email}" profile',
            f'"{local}" email {domain}',
        ):
            if query not in seen_queries:
                seen_queries.add(query)
                queries.append(query)

    return queries


def _normalize_href(href: str) -> str | None:
    if not href:
        return None
    if "uddg=" in href:
        parsed = urlparse(href)
        target = parse_qs(parsed.query).get("uddg", [""])[0]
        return target if target.startswith("http") else None
    if href.startswith("/url"):
        target = parse_qs(urlparse(href).query).get("q", [""])[0]
        return target if target.startswith("http") else None
    if href.startswith(("http://", "https://")):
        parsed = urlparse(href)
        host = parsed.netloc.lower().replace("www.", "")
        if host in BLOCKED_HOSTS:
            return None
        return href
    return None


def _is_blocked_host(url: str) -> bool:
    host = urlparse(url).netloc.lower().replace("www.", "")
    return host in BLOCKED_HOSTS


async def _ddg_fallback(query: str, browser: PlaywrightClient | None) -> list[str]:
    if not get_settings().osint_enable_duckduckgo_fallback:
        return []
    if browser is None:
        return []

    encoded = quote_plus(query)
    search_url = DDG_LITE_ENGINE.format(query=encoded)

    try:
        page = await browser.fetch(search_url)
    except Exception as exc:
        logger.warning("search_probe_fallback_failed", query=query, url=search_url, error=str(exc))
        return []

    html = str(page.get("html") or "")
    if not html:
        return []

    discovered: set[str] = set()
    soup = BeautifulSoup(html, "html.parser")
    for anchor in soup.select("a[href]"):
        normalized = _normalize_href(str(anchor.get("href") or ""))
        if normalized and not _is_blocked_host(normalized):
            discovered.add(normalized)

    return sorted(discovered)


async def search_public_web(query: str, browser: PlaywrightClient | None = None) -> list[str]:
    settings = get_settings()
    api_key = (settings.brave_search_api_key or "").strip()

    if not api_key:
        fallback_results = await _ddg_fallback(query, browser)
        logger.info(
            "search_probe_complete",
            provider="ddg_fallback",
            query=query[:60],
            urls_found=len(fallback_results),
        )
        return fallback_results

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                BRAVE_SEARCH_URL,
                headers={
                    "Accept": "application/json",
                    "X-Subscription-Token": api_key,
                },
                params={
                    "q": query,
                    "count": 20,
                    "text_decorations": False,
                },
            )

        if response.status_code != 200:
            logger.warning(
                "search_probe_brave_non_200",
                status=response.status_code,
                query=query[:60],
            )
            fallback_results = await _ddg_fallback(query, browser)
            logger.info(
                "search_probe_complete",
                provider="ddg_fallback",
                query=query[:60],
                urls_found=len(fallback_results),
            )
            return fallback_results

        payload = response.json() if response.content else {}
        results = payload.get("web", {}).get("results", []) if isinstance(payload, dict) else []

        discovered: list[str] = []
        for row in results:
            if not isinstance(row, dict):
                continue
            url = str(row.get("url") or "")
            if not url or _is_blocked_host(url):
                continue
            discovered.append(url)

        deduped = sorted(set(discovered))
        logger.info(
            "search_probe_complete",
            provider="brave_api",
            query=query[:60],
            urls_found=len(deduped),
        )
        return deduped
    except Exception as exc:
        logger.warning("search_probe_brave_failed", query=query[:60], error=str(exc))
        fallback_results = await _ddg_fallback(query, browser)
        logger.info(
            "search_probe_complete",
            provider="ddg_fallback",
            query=query[:60],
            urls_found=len(fallback_results),
        )
        return fallback_results
