from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.db.repositories.scan_repo import ScanRepository


class TargetRepository:
    def __init__(self) -> None:
        self.scan_repo = ScanRepository()

    async def list_targets(self, session: AsyncSession | None, scan_id: str) -> list[dict]:
        bundle = await self.scan_repo.load_scan_bundle(session, scan_id)
        return bundle["targets"]
