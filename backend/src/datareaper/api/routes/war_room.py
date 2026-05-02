from __future__ import annotations

from fastapi import APIRouter, Depends

from datareaper.api.deps import DbSession, get_war_room_service
from datareaper.services.war_room_service import WarRoomService

router = APIRouter()


@router.get("/{scan_id}")
async def get_war_room(
    scan_id: str, db: DbSession, service: WarRoomService = Depends(get_war_room_service)
) -> dict:
    return await service.get_overview(db, scan_id)


@router.get("/targets/{target_id}/thread")
async def get_target_thread(
    target_id: str, db: DbSession, service: WarRoomService = Depends(get_war_room_service)
) -> dict:
    return await service.get_thread(db, target_id)
