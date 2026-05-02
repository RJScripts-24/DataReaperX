from __future__ import annotations

from fastapi import APIRouter, Depends

from datareaper.api.deps import DbSession, get_target_service
from datareaper.services.target_service import TargetService

router = APIRouter()


@router.get("/{scan_id}")
async def get_targets(
    scan_id: str, db: DbSession, service: TargetService = Depends(get_target_service)
) -> list[dict]:
    return await service.list_targets(db, scan_id)
