from __future__ import annotations

import hashlib
from urllib.parse import urlparse

from sqlalchemy import select

from datareaper.brokers.catalog import load_broker_catalog
from datareaper.brokers.discovery import discover_brokers_async
from datareaper.brokers.matcher import broker_matches
from datareaper.core.config import get_settings
from datareaper.core.ids import new_id
from datareaper.core.logging import get_logger
from datareaper.db.models.activity_event import ActivityEvent
from datareaper.db.models.broker_case import BrokerCase
from datareaper.db.models.identity_profile import IdentityProfile
from datareaper.db.models.scan_job import ScanJob
from datareaper.db.repositories.scan_repo import is_terminal_scan_status
from datareaper.db.session import SessionLocal
from datareaper.realtime.publishers import publish


logger = get_logger(__name__)
MAX_TARGET_DEBUG_EVENTS = 120


def _radar_coords(value: str) -> tuple[int, int]:
    digest = hashlib.sha1(value.encode("utf-8")).digest()
    angle = int(digest[0]) * 360 // 255
    distance = 30 + (int(digest[1]) * 60 // 255)
    return angle, distance


def _normalize_host(url: str) -> str:
    host = urlparse(str(url or "")).netloc.lower().strip()
    if host.startswith("www."):
        host = host[4:]
    return host


def _catalog_rows() -> list[dict]:
    return [
        item
        for item in load_broker_catalog().get("brokers", [])
        if isinstance(item, dict) and item.get("name")
    ]


def _catalog_name_for_hit(url: str, site_hint: str) -> str | None:
    host = _normalize_host(url)
    lowered_hint = str(site_hint or "").strip().lower()

    for broker in _catalog_rows():
        broker_name = str(broker.get("name") or "").strip()
        if not broker_name:
            continue

        if lowered_hint and broker_matches(lowered_hint, broker_name):
            return broker_name

        candidate_urls = [
            str(broker.get("search_url") or ""),
            str(broker.get("search_url_template") or ""),
            str(broker.get("opt_out_url") or ""),
        ]
        for candidate_url in candidate_urls:
            candidate_host = _normalize_host(candidate_url)
            if candidate_host and host and (
                host == candidate_host
                or host.endswith(f".{candidate_host}")
                or candidate_host.endswith(f".{host}")
            ):
                return broker_name

    return None


def _build_target_row(
    broker_name: str,
    payload: dict,
    *,
    source: str,
    status: str = "discovered",
) -> dict:
    raw_data_types = payload.get("data_types") or payload.get("dataTypes") or []
    data_types = [str(item) for item in raw_data_types if str(item).strip()]
    if not data_types:
        data_types = ["Email"]

    url = str(payload.get("url") or payload.get("listing_url") or "").strip()
    confidence = int(payload.get("priority_score") or payload.get("confidence") or 70)
    return {
        "broker_name": broker_name,
        "listing_url": url,
        "data_types": data_types,
        "status": status,
        "last_activity_label": f"Matched via {source}",
        "source": source,
        "confidence": confidence,
    }


def _collect_exposure_targets(events: list[ActivityEvent]) -> tuple[list[dict], list[dict]]:
    accepted: list[dict] = []
    decisions: list[dict] = []
    seen: set[str] = set()

    for event in events:
        payload = dict(event.payload or {})
        url = str(payload.get("url") or "").strip()
        site_hint = str(payload.get("broker_name") or payload.get("site") or "").strip()
        source = str(payload.get("source") or "osint").strip()
        broker_name = _catalog_name_for_hit(url, site_hint)

        if not broker_name:
            decisions.append(
                {
                    "status": "skipped",
                    "reason": "not_in_broker_catalog",
                    "url": url,
                    "site": site_hint,
                    "source": source,
                }
            )
            continue

        if broker_name in seen:
            decisions.append(
                {
                    "status": "skipped",
                    "reason": "duplicate_broker",
                    "url": url,
                    "site": site_hint,
                    "source": source,
                    "broker_name": broker_name,
                }
            )
            continue

        seen.add(broker_name)
        accepted.append(_build_target_row(broker_name, payload, source=source))
        decisions.append(
            {
                "status": "accepted",
                "reason": "catalog_match",
                "url": url,
                "site": site_hint,
                "source": source,
                "broker_name": broker_name,
            }
        )

    return accepted, decisions


async def discover_targets(ctx: dict, scan_id: str) -> dict:
    logger.info("discover_targets_started", scan_id=scan_id)
    session = ctx.get("db_session")
    browser = ctx.get("browser")
    queue = ctx.get("queue")
    settings = get_settings()

    if session is None and SessionLocal is not None:
        async with SessionLocal() as managed_session:
            managed_ctx = {**ctx, "db_session": managed_session}
            return await discover_targets(managed_ctx, scan_id)

    if session is None:
        return {"scan_id": scan_id, "status": "skipped", "reason": "no_db_session"}

    scan = await session.get(ScanJob, scan_id)
    if scan is None:
        logger.warning("discover_targets_missing_scan", scan_id=scan_id)
        return {"scan_id": scan_id, "status": "missing_scan"}
    if is_terminal_scan_status(scan.status):
        logger.info("discover_targets_skipped_terminal", scan_id=scan_id, status=scan.status)
        return {"scan_id": scan_id, "status": "skipped_terminal", "scan_status": scan.status}

    profile_result = await session.execute(
        select(IdentityProfile).where(IdentityProfile.scan_job_id == scan_id)
    )
    profile = profile_result.scalars().first()
    if profile is None:
        return {"scan_id": scan_id, "status": "skipped", "reason": "no_identity"}

    identity = {
        "name": profile.name,
        "real_name": profile.name,
        "location": profile.location,
    }

    exposure_result = await session.execute(
        select(ActivityEvent).where(
            ActivityEvent.scan_job_id == scan_id,
            ActivityEvent.event_type == "exposure_found",
        )
    )
    exposure_events = exposure_result.scalars().all()
    broker_rows, decisions = _collect_exposure_targets(exposure_events)

    if not broker_rows and browser is not None:
        async_rows = await discover_brokers_async(identity, browser)
        for row in async_rows:
            broker_name = str(row.get("broker_name") or "").strip()
            if not broker_name:
                continue
            broker_rows.append(_build_target_row(broker_name, row, source="catalog_probe"))
            decisions.append(
                {
                    "status": "accepted",
                    "reason": "catalog_probe_match",
                    "broker_name": broker_name,
                    "url": str(row.get("listing_url") or ""),
                    "site": broker_name,
                    "source": "catalog_probe",
                }
            )

    existing_result = await session.execute(
        select(BrokerCase).where(BrokerCase.scan_job_id == scan_id)
    )
    existing_names = {case.broker_name for case in existing_result.scalars().all()}

    created = 0
    created_broker_names: list[str] = []
    broker_discovery_stream: list[dict] = []
    jurisdiction = scan.jurisdiction or "DPDP"
    for broker in broker_rows:
        broker_name = str(broker.get("broker_name") or "Unknown")
        if broker_name in existing_names:
            decisions.append(
                {
                    "status": "skipped",
                    "reason": "already_exists",
                    "broker_name": broker_name,
                    "url": str(broker.get("listing_url") or ""),
                    "site": broker_name,
                    "source": str(broker.get("source") or "unknown"),
                }
            )
            continue

        case = BrokerCase(
            id=new_id("case"),
            scan_job_id=scan_id,
            broker_name=broker_name,
            status=str(broker.get("status") or "discovered"),
            jurisdiction=jurisdiction,
            last_activity_label=str(broker.get("last_activity_label") or "Target discovered"),
            data_types=list(broker.get("data_types") or []),
        )
        session.add(case)
        existing_names.add(broker_name)
        created += 1
        created_broker_names.append(broker_name)
        angle, distance = _radar_coords(f"{scan_id}:{broker_name}")
        broker_discovery_stream.append(
            {
                "broker_name": broker_name,
                "angle": angle,
                "distance": distance,
            }
        )

        logger.info(
            "discover_targets_broker_created",
            scan_id=scan_id,
            broker_name=broker_name,
            source=str(broker.get("source") or "unknown"),
            listing_url=str(broker.get("listing_url") or ""),
            data_types=list(broker.get("data_types") or []),
            confidence=int(broker.get("confidence") or 0),
        )

    if settings.osint_debug_events:
        for decision in decisions[:MAX_TARGET_DEBUG_EVENTS]:
            session.add(
                ActivityEvent(
                    id=new_id("evt"),
                    scan_job_id=scan_id,
                    event_type="target_debug",
                    message=(
                        f"Target candidate {decision.get('status')}: "
                        f"{decision.get('broker_name') or decision.get('site') or 'unknown'} "
                        f"({decision.get('reason')})."
                    ),
                    payload={
                        "stage": "broker_discovery",
                        **decision,
                    },
                )
            )

    scan.current_stage = "legal_dispatch"
    scan.progress = 80
    scan.status = "running"
    session.add(
        ActivityEvent(
            id=new_id("evt"),
            scan_job_id=scan_id,
            event_type="Scan",
            message=f"Broker discovery stage completed. New brokers={created}.",
            payload={
                "stage": "broker_discovery",
                "brokers_found": created,
                "exposure_events": len(exposure_events),
                "accepted_candidates": len([d for d in decisions if d.get('status') == 'accepted']),
                "skipped_candidates": len([d for d in decisions if d.get('status') == 'skipped']),
            },
        )
    )
    await session.commit()

    for broker_event in broker_discovery_stream:
        await publish(
            f"scan:{scan_id}",
            {
                "type": "stage_complete",
                "stage": "broker_discovery",
                "scan_id": scan_id,
                "count": 1,
                "summary": False,
                **broker_event,
            },
        )

    if queue is not None:
        await queue.enqueue("send_legal_requests", scan_id=scan_id)

    await publish(
        f"scan:{scan_id}",
        {
            "type": "stage_complete",
            "stage": "broker_discovery",
            "scan_id": scan_id,
            "count": created,
            "broker_names": created_broker_names,
            "summary": True,
            "exposure_events": len(exposure_events),
        },
    )
    logger.info(
        "discover_targets_completed",
        scan_id=scan_id,
        brokers_found=created,
        exposure_events=len(exposure_events),
        accepted_candidates=len([d for d in decisions if d.get("status") == "accepted"]),
        skipped_candidates=len([d for d in decisions if d.get("status") == "skipped"]),
    )
    return {"scan_id": scan_id, "status": "ok", "brokers_found": created}


def run(scan_id: str) -> dict:
    return {"job": "discover_targets", "scan_id": scan_id, "status": "queued"}
