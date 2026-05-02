from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.db.repositories.target_repo import TargetRepository


class TargetService:
    def __init__(self) -> None:
        self.repo = TargetRepository()

    async def list_targets(
        self,
        session: AsyncSession | None,
        scan_id: str,
        *,
        actor_google_sub: str | None = None,
        actor_email: str | None = None,
    ) -> list[dict]:
        return await self.repo.list_targets(
            session,
            scan_id,
            actor_google_sub=actor_google_sub,
            actor_email=actor_email,
        )
