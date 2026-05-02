from __future__ import annotations

from arq import cron
from arq.connections import RedisSettings

from datareaper.core.config import get_settings
from datareaper.db.repositories.battle_repo import BattleRepository
from datareaper.db.repositories.scan_repo import ScanRepository
from datareaper.db.session import SessionLocal
from datareaper.integrations.browser.playwright_client import PlaywrightClient
from datareaper.integrations.llm.groq_client import GroqClient
from datareaper.workers.jobs.build_report_snapshot import build_report_snapshot
from datareaper.workers.jobs.cleanup_old_events import cleanup_old_events
from datareaper.workers.jobs.continue_battles import continue_battles
from datareaper.workers.jobs.discover_targets import discover_targets
from datareaper.workers.jobs.run_osint_pipeline import run_osint_pipeline
from datareaper.workers.jobs.send_legal_requests import send_legal_requests
from datareaper.workers.jobs.sync_inbox import sync_inbox
from datareaper.workers.queue import TaskQueue, get_arq_pool

ACTIVE_SCAN_SYNC_MINUTES = set(range(0, 60, 5))


async def _load_active_scan_ids() -> list[str]:
    repo = ScanRepository()
    if SessionLocal is None:
        return await repo.list_active_scan_ids(None)
    try:
        async with SessionLocal() as session:
            return await repo.list_active_scan_ids(session)
    except Exception:
        return await repo.list_active_scan_ids(None)


async def cleanup_old_events_job(ctx) -> dict:
    active_scan_ids = await _load_active_scan_ids()
    removed_total = 0
    for scan_id in active_scan_ids:
        result = await cleanup_old_events(ctx, scan_id=scan_id)
        removed_total += int(result.get("removed", 0))
    return {"status": "ok", "scans": len(active_scan_ids), "removed": removed_total}


async def build_report_snapshot_job(ctx) -> dict:
    active_scan_ids = await _load_active_scan_ids()
    built = 0
    for scan_id in active_scan_ids:
        result = await build_report_snapshot(ctx, scan_id=scan_id)
        if result.get("status") == "ok":
            built += 1
    return {"status": "ok", "scans": len(active_scan_ids), "reports_built": built}


async def sync_active_scan_inboxes_job(ctx) -> dict:
    queue = ctx.get("queue")
    battle_repo = ctx.get("battle_repo")
    if queue is None:
        return {"status": "skipped", "reason": "missing_queue"}
    if battle_repo is None:
        return {"status": "skipped", "reason": "missing_battle_repo"}

    active_scan_ids = await _load_active_scan_ids()
    enqueued = 0
    skipped_no_threads = 0
    for scan_id in active_scan_ids:
        threads = await battle_repo.get_active_email_threads(scan_id)
        has_gmail_thread = any(bool(thread.get("gmail_thread_id")) for thread in threads)
        if not has_gmail_thread:
            skipped_no_threads += 1
            continue
        await queue.enqueue("sync_inbox", scan_id=scan_id)
        enqueued += 1
    return {
        "status": "ok",
        "scans": len(active_scan_ids),
        "enqueued": enqueued,
        "skipped_no_gmail_threads": skipped_no_threads,
    }


class WorkerSettings:
    functions = [
        run_osint_pipeline,
        discover_targets,
        send_legal_requests,
        sync_inbox,
        continue_battles,
    ]
    cron_jobs = [
        cron(cleanup_old_events_job, hour=2, minute=0),
        cron(build_report_snapshot_job, hour=6, minute=0),
        cron(sync_active_scan_inboxes_job, minute=ACTIVE_SCAN_SYNC_MINUTES),
    ]
    redis_settings = RedisSettings.from_dsn(get_settings().effective_arq_redis_url)
    job_timeout = 1800

    @staticmethod
    async def on_startup(ctx) -> None:
        settings = get_settings()
        ctx["llm"] = GroqClient(model=settings.groq_model)
        ctx["browser"] = PlaywrightClient()
        await ctx["browser"].start()
        ctx["battle_repo"] = BattleRepository()
        ctx["queue"] = TaskQueue(await get_arq_pool())

    @staticmethod
    async def on_shutdown(ctx) -> None:
        browser = ctx.get("browser")
        if browser is not None:
            await browser.stop()
        queue = ctx.get("queue")
        if queue is not None:
            await queue.pool.close()


if __name__ == "__main__":
    print("DataReaper scheduler ready")
