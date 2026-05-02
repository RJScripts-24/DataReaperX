from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.db.repositories.battle_repo import BattleRepository


class InboxService:
    def __init__(self) -> None:
        self.repo = BattleRepository()

    async def sync(self, session: AsyncSession | None, scan_id: str) -> dict:
        overview = await self.repo.get_threads(session, scan_id)
        message_count = sum(target["messageCount"] for target in overview["targets"])
        return {
            "scan_id": scan_id,
            "synced": True,
            "message_count": message_count,
            "active_targets": len(overview["targets"]),
        }
