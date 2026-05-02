from __future__ import annotations

import asyncio

from datareaper.osint.username_discovery import discover_usernames
from datareaper.realtime.node_publisher import emit


def _run_async(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    return []


def _emit(scan_id: str, event_type: str, payload: dict) -> None:
    """Fire-and-forget helper for sync nodes."""
    if not scan_id:
        return
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(emit(scan_id, event_type, payload))
    except Exception:
        pass


def run(state: dict) -> dict:
    state.setdefault("node_history", []).append("username_pivot")
    scan_id = str(state.get("scan_id") or "")
    accounts = state.get("accounts") or []
    account_rows = [row for row in accounts if isinstance(row, dict)]
    seed_value = str(state.get("normalized_seed") or state.get("seed") or "")
    usernames: list[str] = []

    if account_rows:
        discovered = _run_async(discover_usernames(account_rows, original_seeds=[seed_value]))
        if isinstance(discovered, list):
            usernames = [str(item) for item in discovered if item]

    state["usernames"] = usernames
    _emit(
        scan_id,
        "stage_complete",
        {
            "stage": "username_pivot",
            "usernames": usernames,
            "count": len(usernames),
        },
    )
    state["stage"] = "username_pivot"
    state["progress"] = max(int(state.get("progress", 0)), 30)
    return state
