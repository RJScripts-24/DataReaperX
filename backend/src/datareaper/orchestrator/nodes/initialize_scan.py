from __future__ import annotations

from datareaper.core.ids import new_id


def run(state: dict) -> dict:
    state.setdefault("node_history", []).append("initialize_scan")
    if not state.get("scan_id"):
        state["scan_id"] = new_id("scan")
    state["stage"] = "initialize"
    state["progress"] = 0
    return state
