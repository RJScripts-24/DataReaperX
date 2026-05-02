from __future__ import annotations

from fastapi import APIRouter

from datareaper.api.deps import DbSession
from datareaper.db.repositories.scan_repo import ScanRepository

router = APIRouter()


@router.get("/{scan_id}")
async def get_events(scan_id: str, db: DbSession) -> dict:
    bundle = await ScanRepository().load_scan_bundle(db, scan_id)
    return {"scan_id": scan_id, "events": bundle["events"]}
