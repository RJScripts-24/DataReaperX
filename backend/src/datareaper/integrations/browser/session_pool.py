from __future__ import annotations

import asyncio

from datareaper.integrations.browser.playwright_client import PlaywrightClient


class BrowserSessionPool:
    def __init__(self, max_concurrency: int = 3) -> None:
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._client = PlaywrightClient()

    async def start(self) -> None:
        await self._client.start()

    async def stop(self) -> None:
        await self._client.stop()

    async def fetch(
        self,
        url: str,
        wait_selector: str | None = None,
        proxy: str | None = None,
    ) -> dict:
        async with self._semaphore:
            return await self._client.fetch(url, wait_selector=wait_selector, proxy=proxy)

    async def fill_form_and_submit(
        self,
        url: str,
        field_map: dict[str, str],
        submit_selector: str,
    ) -> bool:
        async with self._semaphore:
            return await self._client.fill_form_and_submit(url, field_map, submit_selector)


__all__ = ["BrowserSessionPool"]


def session_config() -> dict:
    return {"pooled": True, "max_concurrency": 3}
