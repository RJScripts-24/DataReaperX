from __future__ import annotations

import arq
from arq.constants import (
    abort_jobs_ss,
    default_queue_name,
    in_progress_key_prefix,
    job_key_prefix,
    result_key_prefix,
    retry_key_prefix,
)

from datareaper.core.config import get_settings
from datareaper.observability.metrics import increment_metric

SCAN_SCOPED_FUNCTIONS = {
    "run_osint_pipeline",
    "discover_targets",
    "send_legal_requests",
    "sync_inbox",
}


async def get_arq_pool():
    settings = get_settings()
    return await arq.create_pool(
        arq.connections.RedisSettings.from_dsn(settings.effective_arq_redis_url)
    )


class TaskQueue:
    def __init__(self, pool) -> None:
        self.pool = pool

    @staticmethod
    def _stable_job_id(function_name: str, kwargs: dict) -> str | None:
        scan_id = str(kwargs.get("scan_id") or "").strip()
        if function_name in SCAN_SCOPED_FUNCTIONS and scan_id:
            return f"{function_name}:{scan_id}"
        return None

    @classmethod
    def scan_job_ids(cls, scan_id: str) -> list[str]:
        clean_scan_id = str(scan_id or "").strip()
        if not clean_scan_id:
            return []
        return [f"{function_name}:{clean_scan_id}" for function_name in SCAN_SCOPED_FUNCTIONS]

    async def enqueue(self, function_name: str, **kwargs) -> str:
        stable_job_id = self._stable_job_id(function_name, kwargs)
        job = await self.pool.enqueue_job(function_name, _job_id=stable_job_id, **kwargs)
        increment_metric("jobs_enqueued")
        if job is not None:
            return job.job_id
        return stable_job_id or ""

    async def enqueue_in(self, function_name: str, delay_seconds: int, **kwargs) -> str:
        stable_job_id = self._stable_job_id(function_name, kwargs)
        job = await self.pool.enqueue_job(
            function_name,
            _job_id=stable_job_id,
            _defer_by=delay_seconds,
            **kwargs,
        )
        increment_metric("jobs_deferred")
        if job is not None:
            return job.job_id
        return stable_job_id or ""

    async def _remove_job(self, job_id: str) -> bool:
        removed = await self.pool.zrem(default_queue_name, job_id)
        await self.pool.zrem(abort_jobs_ss, job_id)
        await self.pool.delete(
            job_key_prefix + job_id,
            result_key_prefix + job_id,
            retry_key_prefix + job_id,
            in_progress_key_prefix + job_id,
        )
        return bool(removed)

    async def cancel_scan_jobs(self, scan_id: str) -> list[str]:
        cancelled: set[str] = set()

        for job_id in self.scan_job_ids(scan_id):
            if await self._remove_job(job_id):
                cancelled.add(job_id)

        for job in await self.pool.queued_jobs():
            if job.function not in SCAN_SCOPED_FUNCTIONS:
                continue
            queued_scan_id = str((job.kwargs or {}).get("scan_id") or "").strip()
            if queued_scan_id != str(scan_id or "").strip():
                continue
            if await self._remove_job(job.job_id):
                cancelled.add(job.job_id)
        return sorted(cancelled)
