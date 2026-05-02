from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.db.repositories.battle_repo import BattleRepository


class InboxService:
    def __init__(self) -> None:
        self.repo = BattleRepository()

    async def sync(
        self,
        session: AsyncSession | None,
        scan_id: str,
        *,
        actor_google_sub: str | None = None,
        actor_email: str | None = None,
    ) -> dict:
        overview = await self.repo.get_threads(
            session,
            scan_id,
            actor_google_sub=actor_google_sub,
            actor_email=actor_email,
        )
        message_count = sum(target["messageCount"] for target in overview["targets"])
        return {
            "scan_id": scan_id,
            "synced": True,
            "message_count": message_count,
            "active_targets": len(overview["targets"]),
        }
