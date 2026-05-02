from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.db.repositories.dashboard_repo import DashboardRepository


class DashboardService:
    def __init__(self) -> None:
        self.repo = DashboardRepository()

    async def get_dashboard(self, session: AsyncSession | None, scan_id: str) -> dict:
        return await self.repo.get_dashboard(session, scan_id)
