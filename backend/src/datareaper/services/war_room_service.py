from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.db.repositories.battle_repo import BattleRepository


class WarRoomService:
    def __init__(self) -> None:
        self.repo = BattleRepository()

    async def get_overview(self, session: AsyncSession | None, scan_id: str) -> dict:
        return await self.repo.get_threads(session, scan_id)

    async def get_thread(self, session: AsyncSession | None, target_id: str) -> dict:
        return await self.repo.get_thread(session, target_id)
