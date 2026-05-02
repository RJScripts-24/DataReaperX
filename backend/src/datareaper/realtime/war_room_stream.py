from __future__ import annotations


def build_war_room_event(scan_id: str) -> dict:
    return {"scan_id": scan_id, "channel": "war-room", "status": "updated"}
