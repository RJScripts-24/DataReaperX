from __future__ import annotations

import hashlib
from urllib.parse import urlparse

from sqlalchemy import delete, select
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError

from datareaper.core.config import get_settings
from datareaper.core.ids import new_id
from datareaper.core.logging import get_logger
from datareaper.db.models.activity_event import ActivityEvent
from datareaper.db.models.discovered_account import DiscoveredAccount
from datareaper.db.models.graph_edge import GraphEdge
from datareaper.db.models.graph_node import GraphNode
from datareaper.db.models.identity_profile import IdentityProfile
from datareaper.db.models.scan_job import ScanJob
from datareaper.db.models.seed import Seed
from datareaper.db.repositories.scan_repo import is_terminal_scan_status
from datareaper.db.session import SessionLocal
from datareaper.osint.pipeline import run_osint_loop
from datareaper.realtime.publishers import publish


logger = get_logger(__name__)
OSINT_REQUEUE_DELAY_SECONDS = 20
MAX_PERSISTED_EXPOSURE_EVENTS_PER_CYCLE = 120
MAX_PERSISTED_DEBUG_EVENTS_PER_CYCLE = 200


def _platform_from_url(url: str) -> str:
    host = urlparse(url).netloc.lower().split(":", 1)[0]
    if host.startswith("www."):
        host = host[4:]
    return host.split(".", 1)[0] if host else "unknown"


def _username_from_url(url: str) -> str:
    parts = [part for part in urlparse(url).path.split("/") if part]
    return parts[-1] if parts else ""


def _normalize_confidence(raw: object) -> int:
    if isinstance(raw, (int, float)):
        value = float(raw)
        if value <= 1.0:
            value *= 100.0
        return max(0, min(int(round(value)), 100))
    return 85


def _is_cancelled(status: str | None) -> bool:
    return str(status or "").strip().lower() == "cancelled"


def _radar_coords(value: str) -> tuple[int, int]:
    digest = hashlib.sha1(value.encode("utf-8")).digest()
    angle = int(digest[0]) * 360 // 255
    distance = 30 + (int(digest[1]) * 60 // 255)
    return angle, distance


async def _refresh_cancelled(scan: ScanJob, session) -> bool:
    await session.refresh(scan, attribute_names=["status"])
    return _is_cancelled(scan.status)


def _account_key(platform: str, username: str, profile_url: str) -> tuple[str, str, str]:
    return (
        profile_url.strip().lower(),
        platform.strip().lower(),
        username.strip().lower(),
    )


def _is_transient_db_error(exc: Exception) -> bool:
    if isinstance(exc, (InterfaceError, OperationalError)):
        return True
    if isinstance(exc, DBAPIError) and exc.connection_invalidated:
        return True

    message = str(exc).lower()
    transient_markers = (
        "connection is closed",
        "connection was closed in the middle",
        "connectiondoesnotexisterror",
        "server closed the connection",
        "connection reset",
    )
    return any(marker in message for marker in transient_markers)


async def run_osint_pipeline(ctx: dict, scan_id: str) -> dict:
    session = ctx.get("db_session")
    llm = ctx.get("llm")
    browser = ctx.get("browser")
    queue = ctx.get("queue")

    if session is None and SessionLocal is not None:
        async with SessionLocal() as managed_session:
            managed_ctx = {**ctx, "db_session": managed_session}
            return await run_osint_pipeline(managed_ctx, scan_id)

    if session is None:
        return {"scan_id": scan_id, "status": "skipped", "reason": "no_db_session"}

    scan = await session.get(ScanJob, scan_id)
    if scan is None:
        logger.warning("run_osint_pipeline_missing_scan", scan_id=scan_id)
        return {"scan_id": scan_id, "status": "missing_scan"}

    if is_terminal_scan_status(scan.status):
        logger.info("run_osint_pipeline_skipped_terminal", scan_id=scan_id, status=scan.status)
        return {"scan_id": scan_id, "status": "skipped_terminal", "scan_status": scan.status}

    logger.info("run_osint_pipeline_started", scan_id=scan_id)

    cycle_rows = await session.execute(
        select(ActivityEvent.id).where(
            ActivityEvent.scan_job_id == scan_id,
            ActivityEvent.event_type == "System",
            ActivityEvent.message.like("OSINT cycle % started.%"),
        )
    )
    cycle_number = len(cycle_rows.scalars().all()) + 1

    scan.status = "running"
    scan.current_stage = "osint"
    scan.progress = max(scan.progress or 0, 20 + min(cycle_number, 5))
    session.add(
        ActivityEvent(
            id=new_id("evt"),
            scan_job_id=scan_id,
            event_type="System",
            message=f"OSINT cycle {cycle_number} started.",
            payload={"stage": "osint", "status": "started", "cycle": cycle_number},
        )
    )
    await session.commit()

    await publish(
        f"scan:{scan_id}",
        {
            "type": "stage_complete",
            "stage": "osint_started",
            "scan_id": scan_id,
        },
    )

    seed = await session.get(Seed, scan.seed_id) if scan.seed_id else None
    seed_value = seed.normalized_value if seed else ""

    existing_accounts = await session.execute(
        select(
            DiscoveredAccount.platform,
            DiscoveredAccount.username,
            DiscoveredAccount.profile_url,
        ).where(DiscoveredAccount.scan_job_id == scan_id)
    )
    known_account_keys = {
        _account_key(str(platform or ""), str(username or ""), str(profile_url or ""))
        for platform, username, profile_url in existing_accounts.all()
    }
    known_urls = {
        key[0]
        for key in known_account_keys
        if key[0]
    }

    existing_exposure_payloads = await session.execute(
        select(ActivityEvent.payload).where(
            ActivityEvent.scan_job_id == scan_id,
            ActivityEvent.event_type == "exposure_found",
        )
    )
    for payload in existing_exposure_payloads.scalars().all():
        if not isinstance(payload, dict):
            continue
        url = str(payload.get("url") or "").strip().lower()
        if url:
            known_urls.add(url)

    if seed_value:
        sibling_scan_rows = await session.execute(
            select(ScanJob.id)
            .join(Seed, ScanJob.seed_id == Seed.id)
            .where(
                Seed.normalized_value == seed_value,
                ScanJob.id != scan_id,
            )
        )
        sibling_scan_ids = [str(row[0]) for row in sibling_scan_rows.all() if row and row[0]]

        if sibling_scan_ids:
            sibling_accounts = await session.execute(
                select(
                    DiscoveredAccount.platform,
                    DiscoveredAccount.username,
                    DiscoveredAccount.profile_url,
                ).where(DiscoveredAccount.scan_job_id.in_(sibling_scan_ids))
            )
            for platform, username, profile_url in sibling_accounts.all():
                key = _account_key(str(platform or ""), str(username or ""), str(profile_url or ""))
                known_account_keys.add(key)
                if key[0]:
                    known_urls.add(key[0])

            sibling_exposure_payloads = await session.execute(
                select(ActivityEvent.payload).where(
                    ActivityEvent.scan_job_id.in_(sibling_scan_ids),
                    ActivityEvent.event_type == "exposure_found",
                )
            )
            for payload in sibling_exposure_payloads.scalars().all():
                if not isinstance(payload, dict):
                    continue
                url = str(payload.get("url") or "").strip().lower()
                if url:
                    known_urls.add(url)

    settings = get_settings()
    sites_found_in_cycle = 0
    deferred_exposure_events: list[dict] = []
    deferred_debug_events: list[dict] = []

    async def _on_site_found(payload: dict) -> None:
        nonlocal sites_found_in_cycle

        url = str(payload.get("url") or "").strip()
        if not url:
            return

        url_key = url.lower()
        if url_key in known_urls:
            return
        known_urls.add(url_key)
        sites_found_in_cycle += 1

        site = str(payload.get("site") or _platform_from_url(url) or "unknown")
        angle, distance = _radar_coords(url)
        event_payload = {
            "stage": "osint_live",
            "cycle": cycle_number,
            "broker_name": site,
            "site": site,
            "url": url,
            "source": str(payload.get("source") or "osint"),
            "data_types": list(payload.get("data_types") or ["Email"]),
            "priority_score": int(payload.get("confidence") or 70),
            "angle": angle,
            "distance": distance,
        }

        logger.info(
            "osint_site_found",
            scan_id=scan_id,
            cycle=cycle_number,
            site=site,
            source=event_payload["source"],
            url=url,
            confidence=event_payload["priority_score"],
            data_types=event_payload["data_types"],
        )

        if len(deferred_exposure_events) < MAX_PERSISTED_EXPOSURE_EVENTS_PER_CYCLE:
            deferred_exposure_events.append(
                {
                    "message": f"Exposure found on {site}.",
                    "payload": event_payload,
                }
            )
        if settings.osint_debug_events and len(deferred_debug_events) < MAX_PERSISTED_DEBUG_EVENTS_PER_CYCLE:
            deferred_debug_events.append(
                {
                    "message": f"OSINT hit accepted: {site} via {event_payload['source']}.",
                    "payload": {
                        "stage": "osint_debug",
                        "cycle": cycle_number,
                        **event_payload,
                    },
                }
            )
        await publish(
            f"scan:{scan_id}",
            {
                "type": "exposure_found",
                "scan_id": scan_id,
                **event_payload,
            },
        )

    async def _should_stop() -> bool:
        return await _refresh_cancelled(scan, session)

    try:
        pipeline = await run_osint_loop(
            [seed_value],
            max_depth=2,
            llm=llm,
            browser=browser,
            on_site_found=_on_site_found,
            should_stop=_should_stop,
        )
    except Exception as exc:
        if await _refresh_cancelled(scan, session):
            await session.commit()
            logger.info("run_osint_pipeline_cancelled_during_cycle", scan_id=scan_id)
            return {"scan_id": scan_id, "status": "cancelled"}

        scan.status = "running"
        scan.current_stage = "osint"
        scan.progress = max(scan.progress or 0, 15)
        session.add(
            ActivityEvent(
                id=new_id("evt"),
                scan_job_id=scan_id,
                event_type="System",
                message="OSINT cycle failed; retry scheduled.",
                payload={"stage": "osint", "error": str(exc), "cycle": cycle_number},
            )
        )
        await session.commit()
        next_job_id = None
        if queue is not None:
            next_job_id = await queue.enqueue_in(
                "run_osint_pipeline",
                delay_seconds=OSINT_REQUEUE_DELAY_SECONDS,
                scan_id=scan_id,
            )
        logger.warning(
            "run_osint_pipeline_failed_retry_scheduled",
            scan_id=scan_id,
            error=str(exc),
            next_job_id=next_job_id,
        )
        return {
            "scan_id": scan_id,
            "status": "retry_scheduled",
            "error": str(exc),
            "next_job_id": next_job_id,
        }

    try:
        accounts = list(pipeline.get("accounts") or [])
        profiles = list(pipeline.get("profiles") or [])
        identity = dict(pipeline.get("identity") or {"real_name": None, "location": None})
        graph = dict(pipeline.get("graph") or {"nodes": [], "edges": []})
        boot_log = [str(line) for line in (pipeline.get("boot_log") or []) if str(line).strip()]
        real_name = (
            identity.get("real_name")
            or identity.get("name")
            or f"Unknown Target ({seed_value})"
        )

        profile_result = await session.execute(
            select(IdentityProfile).where(IdentityProfile.scan_job_id == scan_id)
        )
        profile = profile_result.scalars().first()
        if profile is None:
            profile_id = new_id("profile")
            session.add(
                IdentityProfile(
                    id=profile_id,
                    scan_job_id=scan_id,
                    name=real_name,
                    location=identity.get("location") or "Unknown Location",
                    summary=identity,
                )
            )
        else:
            profile_id = profile.id
            profile.name = real_name
            profile.location = identity.get("location") or profile.location or "Unknown Location"
            profile.summary = identity

        new_accounts = 0
        for row in accounts:
            profile_url = str(row.get("url") or "")
            platform = str(row.get("platform") or _platform_from_url(profile_url))
            username = str(row.get("username") or _username_from_url(profile_url))
            account_key = _account_key(platform, username, profile_url)
            if account_key in known_account_keys:
                continue
            known_account_keys.add(account_key)
            session.add(
                DiscoveredAccount(
                    id=new_id("acct"),
                    scan_job_id=scan_id,
                    profile_id=profile_id,
                    platform=platform,
                    username=username,
                    profile_url=profile_url,
                    confidence=_normalize_confidence(row.get("confidence", 0.85)),
                )
            )
            new_accounts += 1

        for line in boot_log:
            session.add(
                ActivityEvent(
                    id=new_id("evt"),
                    scan_job_id=scan_id,
                    event_type="boot_log",
                    message=line,
                    payload={"stage": "osint_recursive", "cycle": cycle_number},
                )
            )

        for exposure_event in deferred_exposure_events:
            session.add(
                ActivityEvent(
                    id=new_id("evt"),
                    scan_job_id=scan_id,
                    event_type="exposure_found",
                    message=str(exposure_event.get("message") or "Exposure found."),
                    payload=dict(exposure_event.get("payload") or {}),
                )
            )

        for debug_event in deferred_debug_events:
            session.add(
                ActivityEvent(
                    id=new_id("evt"),
                    scan_job_id=scan_id,
                    event_type="osint_debug",
                    message=str(debug_event.get("message") or "OSINT debug."),
                    payload=dict(debug_event.get("payload") or {}),
                )
            )

        await session.execute(delete(GraphEdge).where(GraphEdge.scan_job_id == scan_id))
        await session.execute(delete(GraphNode).where(GraphNode.scan_job_id == scan_id))
        for node in graph.get("nodes", []):
            session.add(
                GraphNode(
                    id=new_id("node"),
                    scan_job_id=scan_id,
                    node_key=node.get("id"),
                    node_type=node.get("type"),
                    label=node.get("label"),
                    pos_x=node.get("x", 0),
                    pos_y=node.get("y", 0),
                    payload=node.get("data", {}),
                )
            )
        for edge in graph.get("edges", []):
            session.add(
                GraphEdge(
                    id=new_id("edge"),
                    scan_job_id=scan_id,
                    source_node_key=edge.get("source"),
                    target_node_key=edge.get("target"),
                    relationship=edge.get("relationship"),
                )
            )

        if await _refresh_cancelled(scan, session):
            await session.commit()
            logger.info("run_osint_pipeline_cancelled_post_crawl", scan_id=scan_id)
            return {"scan_id": scan_id, "status": "cancelled"}

        scan.current_stage = "osint"
        scan.progress = max(scan.progress or 0, 35)
        scan.status = "running"
        session.add(
            ActivityEvent(
                id=new_id("evt"),
                scan_job_id=scan_id,
                event_type="System",
                message=(
                    f"OSINT cycle {cycle_number} completed. "
                    f"New accounts={new_accounts}, sites found={sites_found_in_cycle}."
                ),
                payload={
                    "stage": "osint_cycle",
                    "cycle": cycle_number,
                    "accounts": len(accounts),
                    "new_accounts": new_accounts,
                    "profiles": len(profiles),
                    "sites_found": sites_found_in_cycle,
                },
            )
        )
        await session.commit()

        discover_job_id = None
        if queue is not None and (new_accounts > 0 or sites_found_in_cycle > 0):
            discover_job_id = await queue.enqueue("discover_targets", scan_id=scan_id)

        await session.refresh(scan, attribute_names=["status"])
        next_job_id = None
        material_progress = new_accounts + sites_found_in_cycle + len(profiles)
        if queue is not None and material_progress > 0 and not is_terminal_scan_status(scan.status):
            next_job_id = await queue.enqueue_in(
                "run_osint_pipeline",
                delay_seconds=OSINT_REQUEUE_DELAY_SECONDS,
                scan_id=scan_id,
            )
        elif material_progress == 0:
            scan.current_stage = "osint_complete"
            scan.progress = max(scan.progress or 0, 45)
            scan.status = "completed"
            session.add(
                ActivityEvent(
                    id=new_id("evt"),
                    scan_job_id=scan_id,
                    event_type="System",
                    message="OSINT pipeline completed with no new signal; auto-requeue skipped.",
                    payload={"stage": "osint", "status": "completed", "cycle": cycle_number},
                )
            )
            await session.commit()

        await publish(
            f"scan:{scan_id}",
            {
                "type": "stage_complete",
                "stage": "osint_cycle",
                "scan_id": scan_id,
                "cycle": cycle_number,
                "accounts": len(accounts),
                "new_accounts": new_accounts,
                "profiles": len(profiles),
                "sites_found": sites_found_in_cycle,
                "boot_log_entries": len(boot_log),
                "discover_job_id": discover_job_id,
                "next_job_id": next_job_id,
            },
        )
        logger.info(
            "run_osint_pipeline_cycle_completed",
            scan_id=scan_id,
            cycle=cycle_number,
            accounts=len(accounts),
            new_accounts=new_accounts,
            sites_found=sites_found_in_cycle,
            profiles=len(profiles),
            boot_log_entries=len(boot_log),
            discover_job_id=discover_job_id,
            next_job_id=next_job_id,
        )
        return {
            "scan_id": scan_id,
            "status": "ok",
            "cycle": cycle_number,
            "accounts": len(accounts),
            "new_accounts": new_accounts,
            "sites_found": sites_found_in_cycle,
            "profiles": len(profiles),
            "boot_log": boot_log,
            "discover_job_id": discover_job_id,
            "next_job_id": next_job_id,
        }
    except Exception as exc:
        if not _is_transient_db_error(exc):
            raise

        try:
            await session.rollback()
        except Exception:
            pass

        next_job_id = None
        if queue is not None:
            next_job_id = await queue.enqueue_in(
                "run_osint_pipeline",
                delay_seconds=OSINT_REQUEUE_DELAY_SECONDS,
                scan_id=scan_id,
            )

        logger.warning(
            "run_osint_pipeline_transient_db_error_retry_scheduled",
            scan_id=scan_id,
            error=str(exc),
            next_job_id=next_job_id,
        )
        return {
            "scan_id": scan_id,
            "status": "retry_scheduled",
            "error": str(exc),
            "next_job_id": next_job_id,
        }


def run(scan_id: str) -> dict:
    return {"job": "run_osint_pipeline", "scan_id": scan_id, "status": "queued"}
