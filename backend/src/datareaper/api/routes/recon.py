from __future__ import annotations

from fastapi import APIRouter, Depends

from datareaper.api.deps import DbSession, get_recon_service
from datareaper.schemas.recon import ReconGraphResponse
from datareaper.services.recon_service import ReconService

router = APIRouter()


@router.get("/{scan_id}/graph", response_model=ReconGraphResponse)
async def get_graph(
    scan_id: str, db: DbSession, service: ReconService = Depends(get_recon_service)
) -> dict:
    return await service.get_graph(db, scan_id)
