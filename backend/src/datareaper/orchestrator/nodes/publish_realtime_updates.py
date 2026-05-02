from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from datareaper.realtime.node_publisher import emit


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
    state.setdefault("node_history", []).append("publish_realtime_updates")
    now = datetime.now(UTC).isoformat()
    scan_id = state.get("scan_id")
    targets = [row for row in (state.get("targets") or []) if isinstance(row, dict)]
    events = [row for row in (state.get("events") or []) if isinstance(row, dict)]

    event = {
        "type": "stage_complete",
        "stage": "publish_realtime_updates",
        "scan_id": scan_id,
        "created_at": now,
        "payload": {
            "targets": len(targets),
            "resolved": sum(1 for row in targets if row.get("status") == "resolved"),
            "active": sum(1 for row in targets if row.get("status") != "resolved"),
        },
    }
    events.append(event)

    state["events"] = events
    state["stage"] = "publish_realtime_updates"
    state["progress"] = 100
    state["completed_at"] = now

    _emit(
        str(scan_id or ""),
        "agent_status_change",
        {
            "agent": "sleuth",
            "status": "complete",
            "detail": f"Scan complete. {len(targets)} targets found.",
        },
    )

    return state
