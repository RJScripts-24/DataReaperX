from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.db.repositories.battle_repo import BattleRepository


class WarRoomService:
    def __init__(self) -> None:
        self.repo = BattleRepository()

    async def get_overview(
        self,
        session: AsyncSession | None,
        scan_id: str,
        *,
        actor_google_sub: str | None = None,
        actor_email: str | None = None,
    ) -> dict:
        return await self.repo.get_threads(
            session,
            scan_id,
            actor_google_sub=actor_google_sub,
            actor_email=actor_email,
        )

    async def get_thread(self, session: AsyncSession | None, target_id: str) -> dict:
        return await self.repo.get_thread(session, target_id)
