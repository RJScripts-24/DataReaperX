from __future__ import annotations

from fastapi import APIRouter, Depends

from datareaper.api.deps import DbSession, RequireGoogleSession, get_report_service
from datareaper.schemas.report import ReportResponse
from datareaper.services.report_service import ReportService

router = APIRouter()


@router.get("/{scan_id}", response_model=ReportResponse)
async def get_report(
    scan_id: str,
    db: DbSession,
    principal: RequireGoogleSession,
    service: ReportService = Depends(get_report_service),
) -> dict:
    return await service.get_report(
        db,
        scan_id,
        actor_google_sub=principal.google_sub,
        actor_email=principal.email,
    )
