from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from datareaper.api.deps import DbSession, get_scan_service
from datareaper.schemas.scan import ScanStatusResponse
from datareaper.services.scan_service import ScanService

router = APIRouter()


class StopScanRequest(BaseModel):
    reason: str | None = None


@router.get("/{scan_id}", response_model=ScanStatusResponse)
async def get_scan(
    scan_id: str, db: DbSession, service: ScanService = Depends(get_scan_service)
) -> dict:
    return await service.get_status(db, scan_id)


@router.post("/{scan_id}/stop")
async def stop_scan(
    scan_id: str,
    payload: StopScanRequest,
    db: DbSession,
    service: ScanService = Depends(get_scan_service),
) -> dict:
    return await service.stop_scan(db, scan_id, reason=payload.reason)
