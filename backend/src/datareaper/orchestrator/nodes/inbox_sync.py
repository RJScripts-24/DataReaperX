from __future__ import annotations


def _default_threads() -> list[dict]:
    return [{"thread_id": "thread_1", "status": "synced"}]


def run(state: dict) -> dict:
    state.setdefault("node_history", []).append("inbox_sync")
    existing_threads = state.get("threads")
    if isinstance(existing_threads, list) and existing_threads:
        threads = existing_threads
    else:
        threads = _default_threads()

    state["threads"] = threads
    state["inbox_sync_active"] = True
    state["stage"] = "inbox_sync"
    state["progress"] = max(int(state.get("progress", 0)), 90)
    return state
