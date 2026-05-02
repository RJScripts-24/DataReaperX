from __future__ import annotations

from datetime import UTC, datetime, timedelta

from datareaper.db.repositories.scan_repo import ScanRepository
from datareaper.db.session import SessionLocal


async def cleanup_old_events(ctx: dict, scan_id: str) -> dict:
    session = ctx.get("db_session")

    if session is None and SessionLocal is not None:
        async with SessionLocal() as managed_session:
            managed_ctx = {**ctx, "db_session": managed_session}
            return await cleanup_old_events(managed_ctx, scan_id)

    if session is None:
        return {"scan_id": scan_id, "status": "skipped", "reason": "no_db_session"}

    bundle = await ScanRepository().load_scan_bundle(session, scan_id)
    cutoff = datetime.now(UTC) - timedelta(days=30)
    old_events = [
        event
        for event in bundle.get("events", [])
        if event.get("created_at")
        and datetime.fromisoformat(event["created_at"].replace("Z", "+00:00")) < cutoff
    ]
    return {"scan_id": scan_id, "status": "ok", "removed": len(old_events)}


def run(scan_id: str) -> dict:
    return {"job": "cleanup_old_events", "scan_id": scan_id, "status": "queued"}
