from __future__ import annotations

from fastapi import APIRouter, Depends

from datareaper.api.deps import DbSession, get_dashboard_service
from datareaper.schemas.dashboard import DashboardResponse
from datareaper.services.dashboard_service import DashboardService

router = APIRouter()


@router.get("/{scan_id}", response_model=DashboardResponse)
async def get_dashboard(
    scan_id: str, db: DbSession, service: DashboardService = Depends(get_dashboard_service)
) -> dict:
    return await service.get_dashboard(db, scan_id)
