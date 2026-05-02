from __future__ import annotations

from pydantic import BaseModel


class ScanStatusResponse(BaseModel):
    scan_id: str
    status: str
    current_stage: str
    progress: int
