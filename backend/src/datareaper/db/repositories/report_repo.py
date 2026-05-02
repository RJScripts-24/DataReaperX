from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.db.repositories.scan_repo import ScanRepository


class ReportRepository:
    def __init__(self) -> None:
        self.scan_repo = ScanRepository()

    async def build_report(self, session: AsyncSession | None, scan_id: str) -> dict:
        bundle = await self.scan_repo.load_scan_bundle(session, scan_id)
        return {"scan_id": scan_id, **bundle["report"]}
