from __future__ import annotations

from datareaper.osint.graph_builder import build_graph


def _target_name(item: object) -> str | None:
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        value = item.get("broker_name") or item.get("name")
        if value:
            return str(value)
    return None


def run(state: dict) -> dict:
    state.setdefault("node_history", []).append("graph_build")
    seed = str(state.get("normalized_seed") or state.get("seed") or "")
    accounts = state.get("accounts") or []
    usernames = [str(item) for item in (state.get("usernames") or []) if item]
    identity = state.get("identity") or {}
    targets = state.get("targets") or state.get("brokers") or []

    platforms = [
        str(row.get("platform") or "unknown")
        for row in accounts
        if isinstance(row, dict)
    ]
    target_names = [name for name in (_target_name(item) for item in targets) if name]

    graph = build_graph(
        seed=seed,
        accounts=platforms,
        targets=target_names,
        usernames=usernames,
        identity={
            "name": identity.get("real_name") or identity.get("name"),
            "location": identity.get("location"),
        },
    )

    state["graph"] = graph
    state["stage"] = "graph_build"
    state["progress"] = max(int(state.get("progress", 0)), 50)
    return state
