from __future__ import annotations

from datareaper.db.repositories.report_repo import ReportRepository
from datareaper.db.session import SessionLocal


async def build_report_snapshot(ctx: dict, scan_id: str) -> dict:
    session = ctx.get("db_session")

    if session is None and SessionLocal is not None:
        async with SessionLocal() as managed_session:
            managed_ctx = {**ctx, "db_session": managed_session}
            return await build_report_snapshot(managed_ctx, scan_id)

    if session is None:
        return {"scan_id": scan_id, "status": "skipped", "reason": "no_db_session"}

    report = await ReportRepository().build_report(session, scan_id)
    return {"scan_id": scan_id, "status": "ok", "summary": report.get("summary", "")}


def run(scan_id: str) -> dict:
    return {"job": "build_report_snapshot", "scan_id": scan_id, "status": "queued"}
