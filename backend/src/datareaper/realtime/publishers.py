from __future__ import annotations

from datareaper.observability.metrics import record_event
from datareaper.realtime.event_bus import event_bus


async def publish(channel: str, payload: dict) -> None:
    await event_bus.publish(channel, payload)

    if channel.startswith("scan:"):
        scan_id = channel.split(":", 1)[1]
        if scan_id:
            await event_bus.publish(scan_id, payload)

    if not channel.startswith("scan:") and payload.get("scan_id"):
        await event_bus.publish(f"scan:{payload['scan_id']}", payload)

    record_event(str(payload.get("type") or channel))
