from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from datareaper.core.exceptions import ResourceNotFoundError
from datareaper.core.ids import new_id
from datareaper.core.logging import get_logger
from datareaper.db.in_memory import memory_store
from datareaper.db.models.activity_event import ActivityEvent
from datareaper.db.models.agent_run import AgentRun
from datareaper.db.models.broker import Broker
from datareaper.db.models.broker_case import BrokerCase
from datareaper.db.models.broker_listing import BrokerListing
from datareaper.db.models.discovered_account import DiscoveredAccount
from datareaper.db.models.email_message import EmailMessage
from datareaper.db.models.email_thread import EmailThread
from datareaper.db.models.graph_edge import GraphEdge
from datareaper.db.models.graph_node import GraphNode
from datareaper.db.models.identity_profile import IdentityProfile
from datareaper.db.models.legal_request import LegalRequest
from datareaper.db.models.report_snapshot import ReportSnapshot
from datareaper.db.models.scan_job import ScanJob
from datareaper.db.models.scan_stage import ScanStage
from datareaper.db.models.seed import Seed
from datareaper.db.session import SessionLocal

TERMINAL_SCAN_STATUSES = {"completed", "resolved", "failed", "cancelled"}
logger = get_logger(__name__)


def _is_active_scan_status(status: str | None) -> bool:
    normalized = str(status or "").strip().lower()
    if not normalized:
        return True
    return normalized not in TERMINAL_SCAN_STATUSES


def is_terminal_scan_status(status: str | None) -> bool:
    normalized = str(status or "").strip().lower()
    if not normalized:
        return False
    return normalized in TERMINAL_SCAN_STATUSES


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


class ScanRepository:
    async def create_scan_bundle(self, session: AsyncSession | None, bundle: dict) -> dict:
        if session is None:
            memory_store.save_scan_bundle(bundle)
            return bundle["scan"]

        scan = bundle["scan"]
        identity = bundle["identity"]
        seed_id = new_id("seed")
        profile_id = new_id("profile")

        session.add(
            Seed(
                id=seed_id,
                value=scan["normalized_seed"],
                seed_type=scan["seed_type"],
                normalized_value=scan["normalized_seed"],
            )
        )
        session.add(
            ScanJob(
                id=scan["id"],
                seed_id=seed_id,
                status=scan["status"],
                progress=scan["progress"],
                current_stage=scan["current_stage"],
                jurisdiction=scan["jurisdiction"],
            )
        )

        for stage in bundle["stages"]:
            session.add(
                ScanStage(
                    id=new_id("stage"),
                    scan_job_id=scan["id"],
                    name=stage["name"],
                    status=stage["status"],
                )
            )

        session.add(
            IdentityProfile(
                id=profile_id,
                scan_job_id=scan["id"],
                name=identity.get("name"),
                location=identity.get("location"),
                summary=identity,
            )
        )

        usernames = bundle.get("usernames", [])
        for index, platform in enumerate(bundle.get("accounts", []), start=1):
            session.add(
                DiscoveredAccount(
                    id=new_id("acct"),
                    scan_job_id=scan["id"],
                    profile_id=profile_id,
                    platform=platform,
                    username=(
                        usernames[index - 1]
                        if index - 1 < len(usernames)
                        else f"user_{index}"
                    ),
                    profile_url=f"https://example.com/{platform.lower()}",
                    confidence=88 + index,
                )
            )

        for node in bundle["graph"]["nodes"]:
            session.add(
                GraphNode(
                    id=new_id("node"),
                    scan_job_id=scan["id"],
                    node_key=node["id"],
                    node_type=node["type"],
                    label=node["label"],
                    pos_x=node.get("x", 0),
                    pos_y=node.get("y", 0),
                    payload=node.get("data", {}),
                )
            )
        for edge in bundle["graph"]["edges"]:
            session.add(
                GraphEdge(
                    id=new_id("edge"),
                    scan_job_id=scan["id"],
                    source_node_key=edge["source"],
                    target_node_key=edge["target"],
                    relationship=edge.get("relationship") or "related_to",
                )
            )

        broker_ids: dict[str, str] = {}
        for target in bundle["targets"]:
            broker_id = await self._ensure_broker(session, target["brokerName"])
            broker_ids[target["brokerName"]] = broker_id
            listing_id = new_id("listing")
            session.add(
                BrokerListing(
                    id=listing_id,
                    broker_id=broker_id,
                    profile_id=profile_id,
                    scan_job_id=scan["id"],
                    status=target["status"],
                    confidence=92,
                    matched_data={"dataTypes": target["dataTypes"]},
                )
            )
            session.add(
                BrokerCase(
                    id=target["id"],
                    broker_listing_id=listing_id,
                    broker_id=broker_id,
                    scan_job_id=scan["id"],
                    broker_name=target["brokerName"],
                    status=target["status"],
                    jurisdiction=scan["jurisdiction"],
                    last_activity_label=target["lastActivity"],
                    data_types=target["dataTypes"],
                )
            )

        for legal_request in bundle.get("legal_requests", []):
            session.add(
                LegalRequest(
                    id=legal_request["id"],
                    broker_case_id=legal_request["broker_case_id"],
                    subject=legal_request["subject"],
                    body=legal_request["body"],
                    citations=legal_request["citations"],
                    status=legal_request["status"],
                )
            )

        for target_id, thread in bundle.get("threads", {}).items():
            session.add(
                EmailThread(
                    id=thread["thread_id"],
                    broker_case_id=target_id,
                    external_thread_id=thread["thread_id"],
                    subject=f"Deletion Request - {thread['broker_name']}",
                    status=thread["status"],
                )
            )
            for message in thread["messages"]:
                session.add(
                    EmailMessage(
                        id=message["id"],
                        thread_id=thread["thread_id"],
                        direction=message["type"],
                        body=message["content"],
                        sender=(
                            thread["broker_name"]
                            if message["type"] == "broker"
                            else "DataReaper"
                        ),
                        metadata_json=message.get("metadata", {}),
                        display_timestamp=message["timestamp"],
                    )
                )

        for event in bundle.get("events", []):
            session.add(
                ActivityEvent(
                    id=event["id"],
                    scan_job_id=scan["id"],
                    event_type=event["type"],
                    message=event["message"],
                    payload=event.get("payload", {}),
                )
            )

        for agent in bundle.get("agent_runs", []):
            session.add(
                AgentRun(
                    id=new_id("agent"),
                    scan_job_id=scan["id"],
                    agent_name=agent["agent_name"],
                    status=agent["status"],
                    detail=agent["detail"],
                )
            )

        report = bundle["report"]
        session.add(
            ReportSnapshot(
                id=new_id("report"),
                scan_job_id=scan["id"],
                summary=report["summary"],
                metrics=report["metrics"],
                highlights=report["highlights"],
            )
        )

        await session.commit()
        return scan

    async def get_scan(self, session: AsyncSession | None, scan_id: str) -> dict:
        bundle = await self.load_scan_bundle(session, scan_id)
        return {
            "scan_id": bundle["scan"]["id"],
            "status": bundle["scan"]["status"],
            "current_stage": bundle["scan"]["current_stage"],
            "progress": bundle["scan"]["progress"],
        }

    async def list_active_scan_ids(self, session: AsyncSession | None) -> list[str]:
        if session is None:
            active_ids: list[str] = []
            for scan_id in memory_store.list_scan_ids():
                bundle = memory_store.get_scan_bundle(scan_id) or {}
                status = (bundle.get("scan") or {}).get("status")
                if _is_active_scan_status(status):
                    active_ids.append(scan_id)
            return active_ids

        rows = await session.execute(select(ScanJob.id, ScanJob.status))
        return [
            scan_id
            for scan_id, status in rows.all()
            if _is_active_scan_status(status)
        ]

    async def stop_scan(self, session: AsyncSession | None, scan_id: str, reason: str | None = None) -> dict:
        message = "Scan stopped by user."
        if reason:
            message = f"Scan stopped by user: {reason}"

        if session is None:
            updated = memory_store.update_scan_status(
                scan_id,
                status="cancelled",
                current_stage="stopped_by_user",
            )
            if updated is None:
                raise ResourceNotFoundError(f"Scan {scan_id} not found")
            memory_store.append_event(
                scan_id,
                "System",
                message,
                {"stage": "stopped", "reason": reason or "manual"},
            )
            return {
                "scan_id": scan_id,
                "status": "cancelled",
                "current_stage": "stopped_by_user",
                "progress": int((updated.get("scan") or {}).get("progress", 0)),
            }

        scan = await session.get(ScanJob, scan_id)
        if scan is None:
            raise ResourceNotFoundError(f"Scan {scan_id} not found")

        scan.status = "cancelled"
        scan.current_stage = "stopped_by_user"
        session.add(
            ActivityEvent(
                id=new_id("evt"),
                scan_job_id=scan_id,
                event_type="System",
                message=message,
                payload={"stage": "stopped", "reason": reason or "manual"},
            )
        )
        await session.commit()
        return {
            "scan_id": scan_id,
            "status": scan.status,
            "current_stage": scan.current_stage,
            "progress": int(scan.progress or 0),
        }

    async def load_scan_bundle(self, session: AsyncSession | None, scan_id: str) -> dict:
        if session is None:
            bundle = memory_store.get_scan_bundle(scan_id)
            if bundle is None:
                raise ResourceNotFoundError(f"Scan {scan_id} not found")
            return bundle

        try:
            return await self._load_scan_bundle_from_db(session, scan_id)
        except Exception as exc:
            if not _is_transient_db_error(exc):
                raise

            try:
                await session.rollback()
            except Exception:
                pass

            if SessionLocal is None:
                raise

            logger.warning(
                "scan_bundle_transient_db_error_retrying_with_fresh_session",
                scan_id=scan_id,
                error=str(exc),
            )
            async with SessionLocal() as fresh_session:
                return await self._load_scan_bundle_from_db(fresh_session, scan_id)

    async def _load_scan_bundle_from_db(self, session: AsyncSession, scan_id: str) -> dict:
        scan_job = await session.get(ScanJob, scan_id)
        if scan_job is None:
            raise ResourceNotFoundError(f"Scan {scan_id} not found")

        seed = await session.get(Seed, scan_job.seed_id) if scan_job.seed_id else None
        stages = await session.execute(select(ScanStage).where(ScanStage.scan_job_id == scan_id))
        identity = await session.execute(
            select(IdentityProfile).where(IdentityProfile.scan_job_id == scan_id)
        )
        accounts = await session.execute(
            select(DiscoveredAccount).where(DiscoveredAccount.scan_job_id == scan_id)
        )
        nodes = await session.execute(select(GraphNode).where(GraphNode.scan_job_id == scan_id))
        edges = await session.execute(select(GraphEdge).where(GraphEdge.scan_job_id == scan_id))
        cases = await session.execute(select(BrokerCase).where(BrokerCase.scan_job_id == scan_id))
        events = await session.execute(
            select(ActivityEvent).where(ActivityEvent.scan_job_id == scan_id)
        )
        agent_runs = await session.execute(select(AgentRun).where(AgentRun.scan_job_id == scan_id))
        report = await session.execute(
            select(ReportSnapshot).where(ReportSnapshot.scan_job_id == scan_id)
        )

        target_rows = cases.scalars().all()
        threads_by_target: dict[str, dict] = {}
        legal_requests: list[dict] = []

        for target in target_rows:
            thread_row = await session.execute(
                select(EmailThread).where(EmailThread.broker_case_id == target.id)
            )
            thread = thread_row.scalars().first()
            messages: list[dict] = []
            if thread is not None:
                message_rows = await session.execute(
                    select(EmailMessage).where(EmailMessage.thread_id == thread.id)
                )
                messages = [
                    {
                        "id": message.id,
                        "type": message.direction,
                        "content": message.body,
                        "timestamp": message.display_timestamp,
                        "metadata": message.metadata_json or {},
                    }
                    for message in message_rows.scalars().all()
                ]
                threads_by_target[target.id] = {
                    "thread_id": thread.id,
                    "target_id": target.id,
                    "broker_name": target.broker_name,
                    "status": target.status,
                    "messages": messages,
                }

            request_rows = await session.execute(
                select(LegalRequest).where(LegalRequest.broker_case_id == target.id)
            )
            for request in request_rows.scalars().all():
                legal_requests.append(
                    {
                        "id": request.id,
                        "broker_case_id": request.broker_case_id,
                        "subject": request.subject,
                        "body": request.body,
                        "citations": request.citations or [],
                        "status": request.status,
                    }
                )

        identity_row = identity.scalars().first()
        report_row = report.scalars().first()
        account_rows = accounts.scalars().all()
        node_rows = nodes.scalars().all()
        edge_rows = edges.scalars().all()

        return {
            "scan": {
                "id": scan_job.id,
                "normalized_seed": seed.normalized_value if seed else "",
                "seed_type": seed.seed_type if seed else "auto",
                "jurisdiction": scan_job.jurisdiction,
                "status": scan_job.status,
                "progress": scan_job.progress,
                "current_stage": scan_job.current_stage,
            },
            "stages": [{"name": row.name, "status": row.status} for row in stages.scalars().all()],
            "identity": identity_row.summary if identity_row else {},
            "accounts": [row.platform for row in account_rows],
            "usernames": [row.username for row in account_rows],
            "graph": {
                "nodes": [
                    {
                        "id": row.node_key,
                        "type": row.node_type,
                        "label": row.label,
                        "x": row.pos_x,
                        "y": row.pos_y,
                        "data": row.payload or {},
                    }
                    for row in node_rows
                ],
                "edges": [
                    {
                        "source": row.source_node_key,
                        "target": row.target_node_key,
                        "relationship": row.relationship or "related_to",
                    }
                    for row in edge_rows
                ],
            },
            "events": [
                {
                    "id": row.id,
                    "type": row.event_type,
                    "message": row.message,
                    "created_at": row.created_at.isoformat() if row.created_at else "",
                    "payload": row.payload or {},
                }
                for row in events.scalars().all()
            ],
            "agent_runs": [
                {"agent_name": row.agent_name, "status": row.status, "detail": row.detail or ""}
                for row in agent_runs.scalars().all()
            ],
            "targets": [
                {
                    "id": row.id,
                    "brokerName": row.broker_name,
                    "status": row.status,
                    "lastActivity": row.last_activity_label,
                    "messageCount": len(threads_by_target.get(row.id, {}).get("messages", [])),
                    "dataTypes": row.data_types or [],
                    "threadId": threads_by_target.get(row.id, {}).get("thread_id"),
                }
                for row in target_rows
            ],
            "threads": threads_by_target,
            "legal_requests": legal_requests,
            "report": {
                "summary": report_row.summary if report_row else "",
                "metrics": report_row.metrics if report_row else {},
                "highlights": report_row.highlights if report_row else [],
            },
        }

    async def _ensure_broker(self, session: AsyncSession, broker_name: str) -> str:
        existing = await session.execute(select(Broker).where(Broker.name == broker_name))
        broker = existing.scalars().first()
        if broker is not None:
            return broker.id

        broker_id = new_id("broker")
        session.add(Broker(id=broker_id, name=broker_name, category="data-broker", priority="high"))
        return broker_id
