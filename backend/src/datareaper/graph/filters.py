from __future__ import annotations


def filter_nodes(nodes: list[dict], node_type: str) -> list[dict]:
    return [node for node in nodes if node.get("type") == node_type]
