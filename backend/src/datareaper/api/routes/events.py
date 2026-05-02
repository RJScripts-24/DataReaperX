from __future__ import annotations

from fastapi import APIRouter

from datareaper.api.deps import DbSession, RequireGoogleSession
from datareaper.db.repositories.scan_repo import ScanRepository

router = APIRouter()


@router.get("/{scan_id}")
async def get_events(scan_id: str, db: DbSession, principal: RequireGoogleSession) -> dict:
    bundle = await ScanRepository().load_scan_bundle(
        db,
        scan_id,
        actor_google_sub=principal.google_sub,
        actor_email=principal.email,
    )
    return {"scan_id": scan_id, "events": bundle["events"]}
