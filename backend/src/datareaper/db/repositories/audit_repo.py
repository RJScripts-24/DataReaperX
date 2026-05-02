from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.core.ids import new_id
from datareaper.db.models.audit_log import AuditLog


class AuditRepository:
    async def record(self, session: AsyncSession | None, action: str, payload: dict) -> dict:
        entry = {"id": new_id("audit"), "action": action, "payload": payload}
        if session is None:
            return entry
        session.add(AuditLog(id=entry["id"], action=action, payload=payload))
        await session.commit()
        return entry
