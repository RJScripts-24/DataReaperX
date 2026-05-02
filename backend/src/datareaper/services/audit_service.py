from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.db.repositories.audit_repo import AuditRepository


class AuditService:
    def __init__(self) -> None:
        self.repo = AuditRepository()

    async def record(
        self, session: AsyncSession | None, action: str, payload: dict | None = None
    ) -> dict:
        return await self.repo.record(session, action, payload or {})
