from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.db.repositories.scan_repo import ScanRepository


class GraphRepository:
    def __init__(self) -> None:
        self.scan_repo = ScanRepository()

    async def get_graph(
        self,
        session: AsyncSession | None,
        scan_id: str,
        *,
        actor_google_sub: str | None = None,
        actor_email: str | None = None,
    ) -> dict:
        bundle = await self.scan_repo.load_scan_bundle(
            session,
            scan_id,
            actor_google_sub=actor_google_sub,
            actor_email=actor_email,
        )
        return {"scan_id": scan_id, "nodes": bundle["graph"]["nodes"], "edges": bundle["graph"]["edges"]}
