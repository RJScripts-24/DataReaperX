from __future__ import annotations

from fastapi import APIRouter, Depends

from datareaper.api.deps import DbSession, RequireGoogleSession, get_inbox_service
from datareaper.services.inbox_service import InboxService

router = APIRouter()


@router.post("/{scan_id}/sync")
async def sync_inbox(
    scan_id: str,
    db: DbSession,
    principal: RequireGoogleSession,
    service: InboxService = Depends(get_inbox_service),
) -> dict:
    return await service.sync(
        db,
        scan_id,
        actor_google_sub=principal.google_sub,
        actor_email=principal.email,
    )
