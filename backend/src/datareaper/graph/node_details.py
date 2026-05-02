from __future__ import annotations


def node_details(node: dict) -> dict:
    return node.get("data", {})
