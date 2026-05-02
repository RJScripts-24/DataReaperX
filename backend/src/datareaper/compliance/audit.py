from __future__ import annotations

from datareaper.core.ids import new_id
from datareaper.db.models.audit_log import AuditLog


async def write_audit_log(
    session,
    actor_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    metadata: dict | None = None,
) -> None:
    session.add(
        AuditLog(
            id=new_id("audit"),
            action=action,
            payload={
                "resource_type": resource_type,
                "resource_id": resource_id,
                "metadata": metadata or {},
            },
            actor=actor_id,
            scan_job_id=resource_id if resource_type == "scan_job" else None,
        )
    )


def audit_entry(action: str) -> dict:
    return {"action": action}
