from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import httpx
from playwright.async_api import Browser, BrowserContext, async_playwright

from datareaper.scraper.exceptions import BYOBNotAvailableError

CDP_BASE_URL = "http://localhost:9222"
CDP_HEALTH_URL = f"{CDP_BASE_URL}/json/version"


async def check_byob_available() -> bool:
    """Check whether a CDP-enabled local Chrome instance is reachable.

    Args:
        None.

    Returns:
        True when localhost CDP endpoint is reachable, otherwise False.
    """
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(CDP_HEALTH_URL)
            return response.status_code == 200
    except (httpx.HTTPError, httpx.TimeoutException):
        return False


@asynccontextmanager
async def byob_session() -> AsyncIterator[Browser]:
    """Yield a browser connection to a user-launched Chrome CDP endpoint.

    Args:
        None.

    Returns:
        An async context manager yielding a connected Playwright Browser.
    """
    if not await check_byob_available():
        raise BYOBNotAvailableError(
            "BYOB Chrome CDP endpoint is unavailable on http://localhost:9222. "
            "Launch Chrome with --remote-debugging-port=9222 before running Sleuth."
        )

    async with async_playwright() as playwright:
        try:
            browser = await playwright.chromium.connect_over_cdp(CDP_BASE_URL)
        except Exception as exc:
            raise BYOBNotAvailableError(
                "Failed to connect to local Chrome CDP endpoint at http://localhost:9222"
            ) from exc
        yield browser


async def get_byob_page(url: str) -> str:
    """Fetch HTML from a URL through the user's real Chrome session.

    Args:
        url: Target URL to fetch.

    Returns:
        Full page HTML captured from the BYOB tab.
    """
    async with byob_session() as browser:
        context: BrowserContext
        if browser.contexts:
            context = browser.contexts[0]
        else:
            context = await browser.new_context()

        page = await context.new_page()
        try:
            await page.goto(url, wait_until="networkidle")
            return await page.content()
        finally:
            await page.close()


__all__ = ["byob_session", "check_byob_available", "get_byob_page"]