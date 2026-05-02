from __future__ import annotations

from datetime import UTC, datetime

from datareaper.realtime.event_bus import event_bus


async def emit(scan_id: str, event_type: str, payload: dict) -> None:
    """Fire a typed WS event to all clients subscribed to scan_id."""
    try:
        await event_bus.publish(
            scan_id,
            {
                "event": event_type,
                "occurredAt": datetime.now(UTC).isoformat(),
                "scanId": scan_id,
                "payload": payload,
            },
        )
    except Exception:
        # Publish failures must never interrupt orchestration execution.
        pass