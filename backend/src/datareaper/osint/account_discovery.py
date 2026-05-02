from __future__ import annotations

from datareaper.osint.collectors.holehe_runner import discover_accounts_via_holehe


async def discover_accounts(seed: str) -> list[dict]:
    """
    Route the seed to the appropriate discovery module.
    """
    if "@" in seed:
        return await discover_accounts_via_holehe(seed)
    return []
