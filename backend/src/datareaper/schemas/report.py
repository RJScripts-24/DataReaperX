from __future__ import annotations

from pydantic import BaseModel


class ReportResponse(BaseModel):
    scan_id: str
    summary: str
    metrics: dict[str, int]
    highlights: list[str]
