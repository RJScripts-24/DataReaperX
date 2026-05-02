from __future__ import annotations

import asyncio

from datareaper.osint.account_discovery import discover_accounts


def _run_async(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    return []


def run(state: dict) -> dict:
    state.setdefault("node_history", []).append("email_pivot")
    seed = str(state.get("normalized_seed") or state.get("seed") or "")
    accounts: list[dict] = []

    if "@" in seed:
        discovered = _run_async(discover_accounts(seed))
        if isinstance(discovered, list):
            accounts = [row for row in discovered if isinstance(row, dict)]

    state["accounts"] = accounts
    state["stage"] = "email_pivot"
    state["progress"] = max(int(state.get("progress", 0)), 20)
    return state
