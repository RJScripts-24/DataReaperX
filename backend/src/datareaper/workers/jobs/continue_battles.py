from __future__ import annotations

from datareaper.comms.sync import sync_inbox_for_scan
from datareaper.db.models.scan_job import ScanJob
from datareaper.db.repositories.battle_repo import BattleRepository
from datareaper.db.repositories.scan_repo import is_terminal_scan_status
from datareaper.db.session import SessionLocal


async def continue_battles(ctx: dict, scan_id: str) -> dict:
    session = ctx.get("db_session")
    llm = ctx.get("llm")

    if session is None and SessionLocal is not None:
        async with SessionLocal() as managed_session:
            managed_ctx = {**ctx, "db_session": managed_session}
            return await continue_battles(managed_ctx, scan_id)

    if session is None:
        return {"scan_id": scan_id, "status": "skipped", "reason": "no_db_session"}

    scan = await session.get(ScanJob, scan_id)
    if scan is None:
        return {"scan_id": scan_id, "status": "missing_scan"}
    if is_terminal_scan_status(scan.status):
        return {"scan_id": scan_id, "status": "skipped_terminal", "scan_status": scan.status}

    repo = ctx.get("battle_repo") or BattleRepository()
    updates = await sync_inbox_for_scan(scan_id=scan_id, battle_repo=repo, llm=llm)
    active = sum(1 for update in updates if update.get("intent") not in {"success"})
    return {"scan_id": scan_id, "status": "ok", "updates": len(updates), "active": active}


def run(scan_id: str) -> dict:
    return {"job": "continue_battles", "scan_id": scan_id, "status": "queued"}
