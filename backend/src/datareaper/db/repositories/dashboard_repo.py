from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.db.repositories.scan_repo import ScanRepository


def _count_events(events: list[dict[str, Any]], event_type: str) -> int:
    expected = event_type.strip().lower()
    return sum(1 for event in events if str(event.get("type", "")).strip().lower() == expected)


def _latest_stage_payload(events: list[dict[str, Any]], stage_name: str) -> dict[str, Any]:
    expected = stage_name.strip().lower()
    for event in reversed(events):
        payload = event.get("payload") or {}
        if not isinstance(payload, dict):
            continue
        if str(payload.get("stage", "")).strip().lower() == expected:
            return payload
    return {}


def build_live_agent_statuses(bundle: dict[str, Any]) -> list[dict[str, str]]:
    scan = dict(bundle.get("scan") or {})
    events = [event for event in (bundle.get("events") or []) if isinstance(event, dict)]
    targets = [target for target in (bundle.get("targets") or []) if isinstance(target, dict)]
    threads = dict(bundle.get("threads") or {})

    current_stage = str(scan.get("current_stage") or "").strip().lower()
    scan_status = str(scan.get("status") or "").strip().lower()
    broker_count = len(targets)
    exposure_count = _count_events(events, "exposure_found")
    inbox_thread_count = len(threads)

    broker_discovery_payload = _latest_stage_payload(events, "broker_discovery")
    legal_dispatch_payload = _latest_stage_payload(events, "legal_dispatch")
    dispatched_notices = int(legal_dispatch_payload.get("sent") or 0)
    discovered_brokers = int(broker_discovery_payload.get("brokers_found") or broker_count)

    if scan_status == "cancelled" or current_stage == "stopped_by_user":
        return [
            {"name": "Sleuth Agent", "status": "Stopped", "detail": "Scan stopped by user."},
            {"name": "Legal Agent", "status": "Stopped", "detail": "Target review halted."},
            {"name": "Communications Agent", "status": "Stopped", "detail": "Inbox monitoring halted."},
        ]

    if current_stage == "queueing_osint_pipeline":
        return [
            {"name": "Sleuth Agent", "status": "Queued", "detail": "Waiting to start OSINT pipeline."},
            {"name": "Legal Agent", "status": "Idle", "detail": "Awaiting discovered targets."},
            {"name": "Communications Agent", "status": "Idle", "detail": "Awaiting legal dispatch."},
        ]

    if current_stage == "osint":
        return [
            {
                "name": "Sleuth Agent",
                "status": "Active",
                "detail": f"Running OSINT pipeline. {exposure_count} live exposure(s) confirmed.",
            },
            {"name": "Legal Agent", "status": "Idle", "detail": "Awaiting discovered targets."},
            {"name": "Communications Agent", "status": "Idle", "detail": "Awaiting legal dispatch."},
        ]

    if current_stage == "osint_complete":
        return [
            {
                "name": "Sleuth Agent",
                "status": "Complete",
                "detail": f"Recon finished with {exposure_count} exposure(s) found.",
            },
            {
                "name": "Legal Agent",
                "status": "Queued",
                "detail": "Preparing broker target review from reconnaissance output.",
            },
            {"name": "Communications Agent", "status": "Idle", "detail": "Awaiting legal dispatch."},
        ]

    if current_stage == "legal_dispatch":
        return [
            {
                "name": "Sleuth Agent",
                "status": "Complete",
                "detail": f"Recon finished with {exposure_count} exposure(s) found.",
            },
            {
                "name": "Legal Agent",
                "status": "Active",
                "detail": f"Preparing legal action for {max(discovered_brokers, broker_count)} broker target(s).",
            },
            {"name": "Communications Agent", "status": "Queued", "detail": "Standing by for notice dispatch."},
        ]

    if current_stage == "inbox_monitoring":
        monitored_threads = max(inbox_thread_count, dispatched_notices, broker_count)
        return [
            {
                "name": "Sleuth Agent",
                "status": "Complete",
                "detail": f"Recon finished with {exposure_count} exposure(s) found.",
            },
            {
                "name": "Legal Agent",
                "status": "Complete",
                "detail": f"Dispatched {max(dispatched_notices, broker_count)} legal notice(s).",
            },
            {
                "name": "Communications Agent",
                "status": "Active",
                "detail": f"Monitoring {monitored_threads} broker conversation(s) for replies.",
            },
        ]

    if scan_status in {"completed", "resolved"}:
        return [
            {
                "name": "Sleuth Agent",
                "status": "Complete",
                "detail": f"Recon finished with {exposure_count} exposure(s) found.",
            },
            {
                "name": "Legal Agent",
                "status": "Complete",
                "detail": f"Processed {broker_count} broker case(s).",
            },
            {
                "name": "Communications Agent",
                "status": "Complete" if inbox_thread_count else "Idle",
                "detail": (
                    f"Conversation monitoring finished across {inbox_thread_count} thread(s)."
                    if inbox_thread_count
                    else "No broker inbox activity recorded."
                ),
            },
        ]

    return [
        {
            "name": "Sleuth Agent",
            "status": "Active" if scan_status in {"running", "active"} else "Queued",
            "detail": "Waiting for the next reconnaissance checkpoint.",
        },
        {
            "name": "Legal Agent",
            "status": "Active" if broker_count else "Idle",
            "detail": (
                f"Tracking {broker_count} broker case(s)."
                if broker_count
                else "Awaiting discovered targets."
            ),
        },
        {
            "name": "Communications Agent",
            "status": "Active" if inbox_thread_count else "Idle",
            "detail": (
                f"Monitoring {inbox_thread_count} inbox thread(s)."
                if inbox_thread_count
                else "Awaiting legal dispatch."
            ),
        },
    ]


class DashboardRepository:
    def __init__(self) -> None:
        self.scan_repo = ScanRepository()

    async def get_dashboard(
        self,
        session: AsyncSession | None,
        scan_id: str,
        *,
        actor_google_sub: str | None = None,
        actor_email: str | None = None,
    ) -> dict:
        bundle = await self.scan_repo.load_scan_bundle(
            session,
            scan_id,
            actor_google_sub=actor_google_sub,
            actor_email=actor_email,
        )
        targets = bundle["targets"]
        events = bundle.get("events", [])
        account_platforms = [str(p or "").strip() for p in (bundle.get("accounts") or [])]
        account_usernames = [str(u or "").strip() for u in (bundle.get("usernames") or [])]
        n_surfaces = max(len(account_platforms), len(account_usernames))
        scan = dict(bundle.get("scan") or {})
        seed_type = str(scan.get("seed_type") or "").strip().lower()
        normalized_seed = str(scan.get("normalized_seed") or "").strip()

        brokers_scanned = max(len(targets), n_surfaces)
        deletions_secured = sum(1 for target in targets if str(target.get("status", "")).lower() == "resolved")
        active_disputes = max(brokers_scanned - deletions_secured, 0)
        exposures_from_events = _count_events(events, "exposure_found")
        exposures_found = max(len(targets), exposures_from_events, n_surfaces)

        email_on_targets = sum("Email" in target["dataTypes"] for target in targets)
        phone_on_targets = sum("Phone" in target["dataTypes"] for target in targets)
        location_on_targets = sum(
            "Location" in target["dataTypes"] or "Address" in target["dataTypes"] for target in targets
        )
        from_email_seed = seed_type == "email" or (
            seed_type in {"", "auto"} and "@" in normalized_seed and normalized_seed
        )
        from_phone_seed = seed_type == "phone"

        threat_breakdown = {
            "emails_exposed": max(email_on_targets, n_surfaces if from_email_seed else 0),
            "phone_leaks": max(phone_on_targets, n_surfaces if from_phone_seed else 0),
            "location_traces": location_on_targets,
            "social_profiles": n_surfaces,
        }

        radar_targets: list[dict[str, Any]] = [
            {
                "id": target["id"],
                "broker": target["brokerName"],
                "status": target["status"],
                "angle": 35 + (index * 55),
                "distance": 30 + (index * 10),
                "severity": "critical" if target["status"] == "illegal" else "high" if target["status"] == "stalling" else "medium",
            }
            for index, target in enumerate(targets)
        ]
        if not radar_targets and n_surfaces > 0:
            for index in range(n_surfaces):
                plat = account_platforms[index] if index < len(account_platforms) else "Surface"
                user = account_usernames[index] if index < len(account_usernames) else ""
                label = f"{plat}: @{user}" if user else plat
                radar_targets.append(
                    {
                        "id": f"osint-surface-{index}",
                        "broker": label,
                        "status": "recon",
                        "angle": float(35 + (index * 47) % 320),
                        "distance": float(32 + (index % 6) * 11),
                        "severity": "medium",
                    }
                )

        return {
            "scan_id": scan_id,
            "stats": [
                {"title": "Brokers Scanned", "value": brokers_scanned, "delta": 0, "label": "Active reconnaissance"},
                {"title": "Exposures Found", "value": exposures_found, "delta": 0, "label": "Active threats detected"},
                {"title": "Deletions Secured", "value": deletions_secured, "delta": 0, "label": "Successfully removed"},
                {"title": "Active Legal Disputes", "value": active_disputes, "delta": 0, "label": "Awaiting response"},
            ],
            "threat_breakdown": threat_breakdown,
            "radar_targets": radar_targets,
            "activity_feed": bundle["events"],
            "agent_statuses": build_live_agent_statuses(bundle),
        }
