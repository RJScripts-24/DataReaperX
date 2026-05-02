from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.db.repositories.graph_repo import GraphRepository


class ReconService:
    def __init__(self) -> None:
        self.repo = GraphRepository()

    async def get_graph(self, session: AsyncSession | None, scan_id: str) -> dict:
        return await self.repo.get_graph(session, scan_id)
