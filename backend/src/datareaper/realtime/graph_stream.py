from __future__ import annotations


def build_graph_event(scan_id: str) -> dict:
    return {"scan_id": scan_id, "channel": "graph", "status": "updated"}
