from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.core.logging import get_logger
from datareaper.db.repositories.scan_repo import ScanRepository
from datareaper.realtime.publishers import publish

logger = get_logger(__name__)


async def _cancel_queued_jobs(scan_id: str) -> list[str]:
    try:
        from datareaper.workers.queue import TaskQueue, get_arq_pool
    except Exception as exc:
        logger.warning("stop_scan_queue_import_failed", scan_id=scan_id, error=str(exc))
        return []

    try:
        pool = await get_arq_pool()
    except Exception as exc:
        logger.warning("stop_scan_queue_pool_failed", scan_id=scan_id, error=str(exc))
        return []

    try:
        queue = TaskQueue(pool)
        cancelled = await queue.cancel_scan_jobs(scan_id)
        logger.info("stop_scan_queue_cleanup_complete", scan_id=scan_id, cancelled_job_ids=cancelled)
        return cancelled
    except Exception as exc:
        logger.warning("stop_scan_queue_cleanup_failed", scan_id=scan_id, error=str(exc))
        return []
    finally:
        await pool.close()


class ScanService:
    def __init__(self) -> None:
        self.scan_repo = ScanRepository()

    async def get_status(self, session: AsyncSession | None, scan_id: str) -> dict:
        return await self.scan_repo.get_scan(session, scan_id)

    async def stop_scan(self, session: AsyncSession | None, scan_id: str, reason: str | None = None) -> dict:
        stopped = await self.scan_repo.stop_scan(session, scan_id, reason=reason)
        cancelled_job_ids = await _cancel_queued_jobs(scan_id)
        await publish(
            f"scan:{scan_id}",
            {
                "type": "scan_stopped",
                "scan_id": scan_id,
                "status": stopped.get("status", "cancelled"),
                "current_stage": stopped.get("current_stage", "stopped_by_user"),
                "reason": reason or "manual",
                "cancelled_job_ids": cancelled_job_ids,
            },
        )
        return stopped
