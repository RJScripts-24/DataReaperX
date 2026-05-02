from __future__ import annotations


def dispatch(node: str, state: dict) -> dict:
    state.setdefault("completed_nodes", []).append(node)
    return state
