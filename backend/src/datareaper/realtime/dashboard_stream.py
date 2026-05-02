from __future__ import annotations


def build_dashboard_event(scan_id: str) -> dict:
    return {"scan_id": scan_id, "channel": "dashboard", "status": "updated"}
