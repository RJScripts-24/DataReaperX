from __future__ import annotations

from fastapi import APIRouter, Depends

from datareaper.api.deps import DbSession, get_inbox_service
from datareaper.services.inbox_service import InboxService

router = APIRouter()


@router.post("/{scan_id}/sync")
async def sync_inbox(
    scan_id: str, db: DbSession, service: InboxService = Depends(get_inbox_service)
) -> dict:
    return await service.sync(db, scan_id)
