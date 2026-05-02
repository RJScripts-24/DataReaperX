from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.db.repositories.report_repo import ReportRepository


class ReportService:
    def __init__(self) -> None:
        self.repo = ReportRepository()

    async def get_report(self, session: AsyncSession | None, scan_id: str) -> dict:
        return await self.repo.build_report(session, scan_id)
