from __future__ import annotations

from urllib.parse import quote_plus, urlparse

from bs4 import BeautifulSoup

from datareaper.core.logging import get_logger
from datareaper.integrations.browser.playwright_client import PlaywrightClient

logger = get_logger(__name__)

PASTE_SEARCH_TEMPLATES = [
    "https://gist.github.com/search?q={query}",
    "https://www.reddit.com/search/?q={query}&type=comment",
]

EXCLUDED_PATH_MARKERS = {
    "/search",
    "/login",
    "/auth",
    "/about",
    "/advertising",
    "/careers",
    "/press",
    "/policies",
    "/policy",
    "/agreement",
    "/site-policy",
    "/security",
    "/support",
    "/status",
    "/docs",
    "/help",
}


def _is_relevant_paste_hit(seed: str, href: str, anchor_text: str) -> bool:
    if not href.startswith("http"):
        return False

    parsed = urlparse(href)
    host = parsed.netloc.lower().replace("www.", "")
    path = parsed.path.lower()
    seed_lower = seed.lower()
    seed_local = seed_lower.split("@", 1)[0]
    anchor_lower = anchor_text.strip().lower()
    combined = f"{href.lower()} {anchor_lower}"

    if any(marker in path for marker in EXCLUDED_PATH_MARKERS):
        return False

    if host in {"reddit.com", "gist.github.com", "github.com"}:
        if seed_lower not in combined and seed_local not in combined:
            return False
        if host == "reddit.com":
            return any(marker in path for marker in ("/comments/", "/user/", "/u/", "/r/"))
        if host == "gist.github.com":
            return path.count("/") >= 2
        if host == "github.com":
            return "/gist/" in path

    return False


async def search_paste_sites(seed: str, browser: PlaywrightClient) -> list[str]:
    encoded = quote_plus(seed)
    found: set[str] = set()

    for template in PASTE_SEARCH_TEMPLATES:
        url = template.format(query=encoded)
        try:
            result = await browser.fetch(url)
            html = str(result.get("html") or "")
            soup = BeautifulSoup(html, "html.parser")
            for anchor in soup.select("a[href]"):
                href = str(anchor.get("href") or "")
                anchor_text = anchor.get_text(" ", strip=True)
                if _is_relevant_paste_hit(seed, href, anchor_text):
                    found.add(href)
        except Exception as exc:
            logger.warning("paste_search_failed", url=url, error=str(exc))

    deduped = sorted(found)[:12]
    logger.info("paste_search_complete", seed=seed[:30], hits=len(deduped))
    return deduped
