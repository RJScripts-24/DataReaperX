from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from datareaper.services import onboarding_service


def test_enqueue_osint_pipeline_forces_nondeduped_queue(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakePool:
        async def close(self) -> None:
            captured["pool_closed"] = True

    class FakeTaskQueue:
        def __init__(self, pool) -> None:  # noqa: ANN001
            captured["queue_pool"] = pool

        async def enqueue(self, function_name: str, **kwargs) -> str:
            captured["function_name"] = function_name
            captured["enqueue_kwargs"] = kwargs
            return "job-generated-1"

    async def fake_get_arq_pool():
        return FakePool()

    monkeypatch.setattr("datareaper.workers.queue.TaskQueue", FakeTaskQueue)
    monkeypatch.setattr("datareaper.workers.queue.get_arq_pool", fake_get_arq_pool)

    job_id = asyncio.run(onboarding_service._enqueue_osint_pipeline("scan_test_123", dedupe=False))
    assert job_id == "job-generated-1"
    assert captured.get("function_name") == "run_osint_pipeline"
    assert captured.get("enqueue_kwargs") == {"dedupe": False, "scan_id": "scan_test_123"}
    assert captured.get("pool_closed") is True


def test_is_stale_running_scan_detects_old_update() -> None:
    fresh_scan = SimpleNamespace(updated_at=datetime.now(UTC) - timedelta(seconds=20))
    stale_scan = SimpleNamespace(updated_at=datetime.now(UTC) - timedelta(seconds=400))

    assert onboarding_service._is_stale_running_scan(fresh_scan, stale_seconds=120) is False
    assert onboarding_service._is_stale_running_scan(stale_scan, stale_seconds=120) is True


def test_reuse_existing_running_scan_requeues_when_stale(monkeypatch) -> None:
    service = onboarding_service.OnboardingService()
    existing_scan = SimpleNamespace(
        id="scan_existing_123",
        status="running",
        current_stage="osint",
        progress=35,
        updated_at=datetime.now(UTC) - timedelta(seconds=600),
    )

    class FakeSession:
        def __init__(self) -> None:
            self.added: list[object] = []
            self.commits = 0

        def add(self, value: object) -> None:
            self.added.append(value)

        async def commit(self) -> None:
            self.commits += 1

    fake_session = FakeSession()

    async def fake_find_latest(*_args, **_kwargs):
        return existing_scan

    async def fake_enqueue(scan_id: str, *, dedupe: bool = False) -> str:  # noqa: ARG001
        assert scan_id == "scan_existing_123"
        assert dedupe is False
        return "job_resume_123"

    monkeypatch.setattr(service, "_find_latest_scan_for_seed", fake_find_latest)
    monkeypatch.setattr(onboarding_service, "_enqueue_osint_pipeline", fake_enqueue)
    monkeypatch.setattr(onboarding_service, "get_settings", lambda: SimpleNamespace(app_env="development"))

    result = asyncio.run(
        service._reuse_existing_scan_if_available(
            session=fake_session,  # type: ignore[arg-type]
            normalized_seed="user@email.com",
            seed_type="email",
            jurisdiction="DPDP",
            seed_count=1,
        )
    )

    assert result is not None
    assert result.get("scan_id") == "scan_existing_123"
    assert result.get("status") == "resuming"
    assert existing_scan.current_stage == "queueing_osint_pipeline"
    assert fake_session.commits == 1
