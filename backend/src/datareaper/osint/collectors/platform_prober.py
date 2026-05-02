from __future__ import annotations

import asyncio
import re
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urlparse

import yaml
from curl_cffi.requests import AsyncSession

from datareaper.core.config import get_settings
from datareaper.core.logging import get_logger
from datareaper.osint.username_discovery import is_plausible_username

if TYPE_CHECKING:
    from datareaper.integrations.browser.playwright_client import PlaywrightClient


logger = get_logger(__name__)

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

WAF_TITLES = {
    "just a moment",
    "attention required",
    "cloudflare",
    "ddos-guard",
    "access denied",
    "please wait",
    "security check",
    "403 forbidden",
    "enable javascript",
}


def _load_probe_catalog() -> list[dict]:
    path = Path(get_settings().data_dir) / "platforms" / "username_probe_catalog.yaml"
    payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    platforms = payload.get("platforms") or []
    if not isinstance(platforms, list):
        return []
    return [row for row in platforms if isinstance(row, dict)]


def _extract_title(html: str) -> str:
    match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    return match.group(1).strip().lower() if match else ""


def _is_hit(title: str, username: str, platform: dict) -> bool:
    title_lower = title.lower()
    if any(waf in title_lower for waf in WAF_TITLES):
        return False

    pos = (platform.get("positive_title") or "").format(username=username.lower()).lower()
    neg = (platform.get("negative_title") or "").format(username=username.lower()).lower()
    if neg and neg in title_lower:
        return False
    if pos and pos not in title_lower:
        return False
    return True


def _looks_like_waf(html: str) -> bool:
    lowered = html.lower()
    return any(marker in lowered for marker in WAF_TITLES)


def _looks_like_profile_timeout_hit(url: str, username: str, html: str) -> bool:
    """Fallback heuristic for JS-heavy pages that timeout before DOMContentLoaded."""
    parsed = urlparse(url)
    path = parsed.path.lower()
    uname = username.strip().lower().lstrip("@")
    if not uname:
        return False

    lowered = html.lower()
    # Require both platform and username markers to reduce false positives.
    host = parsed.netloc.lower()
    return (
        uname in lowered
        and uname in path
        and any(marker in lowered for marker in ("profile", "channel", "account", "@"))
        and any(site in host for site in ("x.com", "twitter.com", "linkedin.com", "instagram.com", "twitch.tv"))
    )


def _username_signal_variants(username: str) -> set[str]:
    normalized = username.strip().lower().lstrip("@")
    compact = re.sub(r"[._-]", "", normalized)
    return {item for item in {normalized, compact} if item}


def _has_username_signal(username: str, title: str, html: str) -> bool:
    title_lower = title.lower()
    snippet = html[:8000].lower()

    for variant in _username_signal_variants(username):
        if variant in title_lower or variant in snippet:
            return True
    return False


async def _check_with_curl(
    username: str,
    platform: dict,
    semaphore: asyncio.Semaphore,
) -> dict | None:
    if not is_plausible_username(username):
        return None
    url = str(platform.get("url") or "").format(username=username)
    async with semaphore:
        try:
            async with AsyncSession(impersonate="chrome120", headers=HTTP_HEADERS) as session:
                resp = await session.get(url, timeout=12, allow_redirects=True)
                if resp.status_code in (404, 410, 403, 429):
                    return None

                html = str(resp.text or "")
                if _looks_like_waf(html):
                    return None

                title = _extract_title(html)
                if not _is_hit(title, username, platform):
                    return None
                final_url = str(getattr(resp, "url", url) or url)
                if not _has_username_signal(username, title, html):
                    return None

                return {
                    "platform": platform.get("name"),
                    "username": username,
                    "url": final_url,
                    "title": title,
                    "likely_exists": True,
                }
        except Exception:
            return None


async def _check_with_browser(
    username: str,
    platform: dict,
    browser: PlaywrightClient,
    semaphore: asyncio.Semaphore,
) -> dict | None:
    if not is_plausible_username(username):
        return None
    url = str(platform.get("url") or "").format(username=username)
    async with semaphore:
        try:
            result = await browser.fetch(url)
            status = result.get("status", 0)
            if status in (404, 410, 403, 429):
                return None

            html = str(result.get("html") or "")
            if not html:
                return None

            if _looks_like_waf(html):
                return None

            title = _extract_title(html)
            final_url = str(result.get("final_url") or url)

            if not _is_hit(title, username, platform):
                timed_out = bool(result.get("timed_out"))
                if not (timed_out and _looks_like_profile_timeout_hit(url, username, html)):
                    return None
            elif not _has_username_signal(username, title, html):
                return None

            return {
                "platform": platform.get("name"),
                "username": username,
                "url": final_url,
                "title": title,
                "likely_exists": True,
            }
        except Exception:
            return None


async def probe_usernames(
    usernames: list[str],
    browser: PlaywrightClient | None = None,
    concurrency: int = 10,
    allow_browser_fallback: bool = False,
) -> list[dict]:
    filtered_usernames = sorted(
        {username.strip().lower() for username in usernames if is_plausible_username(username)}
    )
    if not filtered_usernames:
        return []

    try:
        catalog = _load_probe_catalog()
        if not catalog:
            logger.warning("platform_probe_catalog_empty")
            return []

        semaphore = asyncio.Semaphore(concurrency)
        results: list[dict] = []

        # Phase 1: low-cost TLS impersonation probe across all platforms.
        phase1_tasks = [
            _check_with_curl(username, platform, semaphore)
            for username in filtered_usernames
            for platform in catalog
        ]
        phase1 = await asyncio.gather(*phase1_tasks, return_exceptions=True)
        results.extend(r for r in phase1 if isinstance(r, dict))

        confirmed_platforms = {
            str(row.get("platform") or "")
            for row in results
            if isinstance(row, dict)
        }

        # Phase 2: browser fallback for non-http-only platforms not confirmed in phase 1.
        if browser is not None and allow_browser_fallback:
            browser_only = [
                platform
                for platform in catalog
                if (
                    not platform.get("http_only")
                    and str(platform.get("name") or "") not in confirmed_platforms
                )
            ]
            browser_tasks = [
                _check_with_browser(username, platform, browser, semaphore)
                for username in filtered_usernames
                for platform in browser_only
            ]
            browser_results = await asyncio.gather(*browser_tasks, return_exceptions=True)
            results.extend(r for r in browser_results if isinstance(r, dict))

        deduped: dict[str, dict] = {}
        for row in results:
            key = str(row.get("url") or "") or f"{row.get('platform')}:{row.get('username')}"
            if key:
                deduped[key] = row

        final_results = list(deduped.values())
        total_probes = len(filtered_usernames) * len(catalog)
        logger.info(
            "platform_probe_complete",
            usernames=len(filtered_usernames),
            total_probes=total_probes,
            hits=len(final_results),
        )
        return final_results
    except Exception as exc:
        logger.warning("platform_probe_failed", error=str(exc))
        return []
