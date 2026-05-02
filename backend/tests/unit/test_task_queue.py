import asyncio
from types import SimpleNamespace

from datareaper.workers.queue import TaskQueue


class _FakePool:
    def __init__(self) -> None:
        self.calls: list[dict] = []
        self._seen_job_ids: set[str] = set()
        self._counter = 0

    async def enqueue_job(self, function_name: str, **kwargs):
        self.calls.append({"function_name": function_name, **kwargs})
        job_id = kwargs.get("_job_id")
        if job_id:
            if job_id in self._seen_job_ids:
                return None
            self._seen_job_ids.add(job_id)
            return SimpleNamespace(job_id=job_id)
        self._counter += 1
        return SimpleNamespace(job_id=f"generated-{self._counter}")


def test_enqueue_in_uses_stable_id_by_default() -> None:
    async def _run() -> None:
        pool = _FakePool()
        queue = TaskQueue(pool)
        job_id = await queue.enqueue_in("run_osint_pipeline", delay_seconds=20, scan_id="scan_123")

        assert job_id == "run_osint_pipeline:scan_123"
        assert pool.calls[0]["_job_id"] == "run_osint_pipeline:scan_123"
        assert pool.calls[0]["_defer_by"] == 20

    asyncio.run(_run())


def test_enqueue_in_without_dedupe_uses_unique_job_ids() -> None:
    async def _run() -> None:
        pool = _FakePool()
        queue = TaskQueue(pool)

        first = await queue.enqueue_in(
            "run_osint_pipeline",
            delay_seconds=20,
            dedupe=False,
            scan_id="scan_123",
        )
        second = await queue.enqueue_in(
            "run_osint_pipeline",
            delay_seconds=20,
            dedupe=False,
            scan_id="scan_123",
        )

        assert first == "generated-1"
        assert second == "generated-2"
        assert pool.calls[0]["_job_id"] is None
        assert pool.calls[1]["_job_id"] is None

    asyncio.run(_run())
