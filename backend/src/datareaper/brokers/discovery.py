from __future__ import annotations

import asyncio
from urllib.parse import quote_plus

from datareaper.brokers.catalog import load_broker_catalog
from datareaper.integrations.browser.playwright_client import PlaywrightClient


async def discover_brokers_async(identity: dict, browser: PlaywrightClient) -> list[dict]:
    catalog = load_broker_catalog().get("brokers", [])
    name = str(identity.get("name") or identity.get("real_name") or "").strip()
    location = str(identity.get("location") or "").strip()
    if not name:
        return []

    semaphore = asyncio.Semaphore(5)
    lowered_name = name.lower()

    async def _check_broker(broker: dict) -> dict | None:
        async with semaphore:
            search_template = broker.get("search_url") or broker.get("search_url_template")
            if not search_template:
                return None
            listing_url = str(search_template).format(
                name=quote_plus(name),
                location=quote_plus(location),
            )
            page = await browser.fetch(listing_url)
            html = str(page.get("html") or "")
            if lowered_name not in html.lower():
                return None
            return {
                "broker_name": broker.get("name"),
                "listing_url": listing_url,
                "opt_out_email": broker.get("opt_out_email"),
                "data_found": True,
            }

    results = await asyncio.gather(
        *[_check_broker(broker) for broker in catalog],
        return_exceptions=True,
    )
    return [row for row in results if isinstance(row, dict)]


def discover_brokers(identity: dict) -> list[str]:
    """Synchronous broker list for legacy orchestrator paths."""
    if not identity.get("name") and not identity.get("real_name"):
        return []
    catalog = load_broker_catalog().get("brokers", [])
    return [
        str(item.get("name"))
        for item in catalog[:5]
        if isinstance(item, dict) and item.get("name")
    ]
