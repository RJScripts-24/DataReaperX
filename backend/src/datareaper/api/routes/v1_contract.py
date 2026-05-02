"""Contract-aligned /v1 API endpoints consumed by the React frontend."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import secrets
from typing import Any, TypeVar

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select

from datareaper.api.deps import DbSession, get_onboarding_service, get_scan_service
from datareaper.comms.dispatch_recipients import resolve_dispatch_recipient
from datareaper.comms.outbound_dispatcher import dispatch_notice
from datareaper.core.config import get_settings
from datareaper.core.exceptions import DataReaperError, InvalidSeedError, ResourceNotFoundError
from datareaper.core.ids import new_id
from datareaper.core.logging import get_logger
from datareaper.db.in_memory import memory_store
from datareaper.db.models.activity_event import ActivityEvent
from datareaper.db.models.broker_case import BrokerCase
from datareaper.db.models.email_message import EmailMessage
from datareaper.db.models.email_thread import EmailThread
from datareaper.db.models.legal_request import LegalRequest
from datareaper.db.models.scan_job import ScanJob
from datareaper.db.models.seed import Seed
from datareaper.db.repositories.dashboard_repo import DashboardRepository, build_live_agent_statuses
from datareaper.db.repositories.scan_repo import ScanRepository
from datareaper.legal.citation_builder import build_citations
from datareaper.legal.notice_builder import build_notice
from datareaper.realtime.publishers import publish
from datareaper.schemas.api_v1 import (
    ActivityLog,
    ActivityLogPage,
    AgentStatus,
    AgentStatusesResponse,
    ApiError,
    CreateMessageRequest,
    CreateScanRequest,
    CreateScanResponse,
    CreateSessionRequest,
    CreateSessionResponse,
    DashboardStats,
    DashboardSummary,
    DashboardTrends,
    EngagementDetail,
    EngagementMessage,
    EngagementSummary,
    EscalateEngagementRequest,
    EscalateEngagementResponse,
    IdentityGraphEdge,
    IdentityGraphFilters,
    IdentityGraphNode,
    IdentityGraphPayload,
    MessageMetadata,
    MessagePage,
    PageInfo,
    PivotChain,
    PivotColumn,
    PivotEdge,
    PivotSummaryItem,
    RadarTarget,
    RadarTargetsResponse,
    RouteHints,
    Scan,
    SeedInput,
    ThreatBreakdownItem,
)
from datareaper.services.onboarding_service import OnboardingService
from datareaper.services.scan_service import ScanService

router = APIRouter()
logger = get_logger(__name__)

_SCAN_REPO = ScanRepository()
_DASHBOARD_REPO = DashboardRepository()
_SESSION_TTL = timedelta(hours=8)
_SESSIONS: dict[str, datetime] = {}
_MANUAL_MESSAGES: dict[tuple[str, str], list[EngagementMessage]] = {}
T = TypeVar("T")


class StopScanRequest(BaseModel):
    reason: str | None = None


def _api_error(status_code: int, code: str, message: str, details: list[dict[str, Any]] | None = None) -> JSONResponse:
    logger.warning(
        "api_contract_error_response",
        status_code=status_code,
        code=code,
        message=message,
        details_count=len(details or []),
    )
    payload = ApiError(code=code, message=message, details=details)
    return JSONResponse(status_code=status_code, content=payload.model_dump(mode="json", exclude_none=True))


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return _now_utc()
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return _now_utc()


def _scan_status(internal_status: str | None, current_stage: str | None) -> str:
    status = (internal_status or "").strip().lower()
    stage = (current_stage or "").strip().lower()

    if status in {"completed", "resolved"}:
        return "completed"
    if status in {"failed", "error"}:
        return "failed"
    if status in {"cancelled", "stopped"}:
        return "cancelled"
    if status in {"queued"}:
        return "queued"
    if status in {"discovering", "identifying", "engaging", "stabilizing"}:
        return status

    if "discover" in stage or "osint" in stage:
        return "discovering"
    if "identity" in stage or "graph" in stage:
        return "identifying"
    if "engage" in stage or "legal" in stage or "publish" in stage:
        return "engaging"

    return "discovering"


def _threat_type_from_target(target: dict[str, Any], index: int) -> str:
    data_types = [str(item).lower() for item in target.get("dataTypes", [])]
    if any("email" in item for item in data_types):
        return "email"
    if any("phone" in item for item in data_types):
        return "phone"
    if any("location" in item or "address" in item for item in data_types):
        return "location"
    return ["email", "phone", "location"][index % 3]


def _radar_status_from_engagement(status: str) -> str:
    normalized = _engagement_status(status)
    if normalized == "resolved":
        return "Identified"
    if normalized == "illegal":
        return "Deletion in progress"
    return "Scanning"


def _engagement_status(status: str | None) -> str:
    normalized = str(status or "").strip().lower()
    if normalized in {"resolved", "success"}:
        return "resolved"
    if normalized in {"illegal", "illegal_pushback", "legal_violation"}:
        return "illegal"
    if normalized in {"stalling", "irrelevant"}:
        return "stalling"
    return "in-progress"


def _activity_color(activity_type: str) -> str:
    return {
        "System": "#a0a0a0",
        "Scan": "#4f7d5c",
        "Match": "#4f7d5c",
        "Legal": "#b94a48",
        "Comm": "#d17a22",
    }.get(activity_type, "#4a6fa5")


def _agent_mode(name: str) -> str:
    lowered = name.lower()
    if "sleuth" in lowered:
        return "SLEUTH"
    if "legal" in lowered:
        return "LEGAL"
    if "comm" in lowered:
        return "COMMS"
    return "DELETION"


def _parse_cursor(cursor: str | None) -> int:
    if not cursor:
        return 0
    value = int(cursor)
    return max(0, value)


def _paginate(items: list[T], cursor: str | None, limit: int) -> tuple[list[T], PageInfo]:
    offset = _parse_cursor(cursor)
    page_items = items[offset : offset + limit]
    next_offset = offset + limit
    has_more = next_offset < len(items)
    return page_items, PageInfo(nextCursor=str(next_offset) if has_more else None, hasMore=has_more)


def _trend_from_value(value: int) -> list[int]:
    base = max(0, int(value))
    if base == 0:
        return [0] * 8
    step = max(1, base // 8)
    trend = [max(0, base - step * (7 - idx)) for idx in range(8)]
    trend[-1] = base
    return trend


def _fallback_identity_graph(bundle: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    scan = dict(bundle.get("scan") or {})
    seed_value = str(scan.get("normalized_seed") or "seed")
    raw_accounts = [str(item).strip() for item in (bundle.get("accounts") or []) if str(item).strip()]
    raw_usernames = [str(item).strip() for item in (bundle.get("usernames") or []) if str(item).strip()]
    raw_targets = [str(item.get("brokerName") or "").strip() for item in (bundle.get("targets") or []) if isinstance(item, dict)]
    identity = dict(bundle.get("identity") or {})

    accounts = list(dict.fromkeys(raw_accounts))[:6]
    usernames = list(dict.fromkeys(raw_usernames))[:6]
    targets = list(dict.fromkeys(raw_targets))[:8]
    identity_name = str(identity.get("real_name") or identity.get("name") or seed_value).strip()
    identity_location = str(identity.get("location") or "").strip()

    nodes: list[dict[str, Any]] = [
        {
            "id": "seed",
            "type": "seed",
            "label": seed_value,
            "x": 400,
            "y": 140,
            "data": {"value": seed_value, "details": ["Primary input seed"]},
        }
    ]
    edges: list[dict[str, Any]] = []

    for index, account in enumerate(accounts, start=1):
        node_id = f"platform_{index}"
        nodes.append(
            {
                "id": node_id,
                "type": "platform",
                "label": account,
                "x": 140 + ((index - 1) * 110),
                "y": 255,
                "data": {"platform": account, "value": account},
            }
        )
        edges.append({"source": "seed", "target": node_id, "relationship": "pivoted_to"})

    for index, username in enumerate(usernames, start=1):
        node_id = f"username_{index}"
        platform_ref = f"platform_{min(index, max(len(accounts), 1))}"
        nodes.append(
            {
                "id": node_id,
                "type": "username",
                "label": username,
                "x": 140 + ((index - 1) * 110),
                "y": 360,
                "data": {"value": username},
            }
        )
        edges.append(
            {
                "source": platform_ref if accounts else "seed",
                "target": node_id,
                "relationship": "discovered_username",
            }
        )

    nodes.append(
        {
            "id": "identity_name",
            "type": "identity",
            "label": identity_name,
            "x": 290,
            "y": 470,
            "data": {"value": identity_name, "details": ["Resolved identity"]},
        }
    )
    edges.append(
        {
            "source": f"username_{1}" if usernames else "seed",
            "target": "identity_name",
            "relationship": "resolved_identity",
        }
    )

    if identity_location:
        nodes.append(
            {
                "id": "identity_location",
                "type": "identity",
                "label": identity_location,
                "x": 510,
                "y": 470,
                "data": {"value": identity_location, "details": ["Resolved location"]},
            }
        )
        edges.append(
            {
                "source": "identity_name",
                "target": "identity_location",
                "relationship": "correlates_with",
            }
        )

    for index, broker_name in enumerate(targets, start=1):
        node_id = f"target_{index}"
        nodes.append(
            {
                "id": node_id,
                "type": "target",
                "label": broker_name,
                "x": 120 + ((index - 1) * 90),
                "y": 585,
                "data": {"status": "Discovered broker target", "details": ["Matched from live scan results"]},
            }
        )
        edges.append({"source": "identity_name", "target": node_id, "relationship": "found_on_broker"})

    return {"nodes": nodes, "edges": edges}


def _message_metadata(raw: dict[str, Any] | None) -> MessageMetadata | None:
    if not raw:
        return None
    return MessageMetadata(
        classification=raw.get("classification"),
        legalCitation=raw.get("legalCitation") or raw.get("citations"),
        explanation=raw.get("explanation"),
    )


async def _load_bundle(db: DbSession, scan_id: str) -> dict[str, Any]:
    return await _SCAN_REPO.load_scan_bundle(db, scan_id)


@router.post("/sessions", response_model=CreateSessionResponse, status_code=201)
async def create_session(payload: CreateSessionRequest) -> CreateSessionResponse:
    _ = payload
    session_id = f"ses_{secrets.token_hex(12)}"
    expires_at = _now_utc() + _SESSION_TTL
    _SESSIONS[session_id] = expires_at
    return CreateSessionResponse(sessionId=session_id, expiresAt=expires_at)


@router.post("/scans", response_model=CreateScanResponse, status_code=202)
async def create_scan(
    payload: CreateScanRequest,
    db: DbSession,
    service: OnboardingService = Depends(get_onboarding_service),
):
    logger.info(
        "create_scan_requested",
        seed_type=payload.seed.type,
        jurisdiction_hint=payload.jurisdictionHint,
    )
    try:
        active_scan_ids = await _SCAN_REPO.list_active_scan_ids(db)
    except Exception as exc:
        logger.warning("active_scan_check_failed", error=str(exc))
        active_scan_ids = []

    if active_scan_ids:
        return _api_error(409, "scan_in_progress", "A scan is already in progress.")

    jurisdiction = payload.jurisdictionHint if payload.jurisdictionHint != "AUTO" else get_settings().default_jurisdiction

    try:
        created = await service.initialize_scan(
            db,
            seeds=[payload.seed.value],
            seed_type=payload.seed.type,
            jurisdiction=jurisdiction,
        )
    except (ValueError, InvalidSeedError) as exc:
        logger.warning(
            "create_scan_invalid_seed",
            seed_type=payload.seed.type,
            jurisdiction=jurisdiction,
            error=str(exc),
        )
        return _api_error(400, "invalid_seed", str(exc))
    except DataReaperError as exc:
        logger.warning(
            "create_scan_domain_error",
            seed_type=payload.seed.type,
            jurisdiction=jurisdiction,
            error=str(exc),
        )
        return _api_error(400, "scan_create_failed", str(exc))
    except Exception as exc:
        logger.exception(
            "create_scan_failed",
            seed_type=payload.seed.type,
            jurisdiction=jurisdiction,
            error=str(exc),
        )
        return _api_error(400, "scan_create_failed", str(exc))

    now = _now_utc()
    return CreateScanResponse(
        scanId=str(created["scan_id"]),
        status="discovering",
        startedAt=now,
        routeHints=RouteHints(),
        estimatedDuration=180,
    )


@router.get("/scans/{scanId}", response_model=Scan)
async def get_scan(scanId: str, db: DbSession):
    try:
        bundle = await _load_bundle(db, scanId)
    except ResourceNotFoundError:
        return _api_error(404, "scan_not_found", f"Scan '{scanId}' was not found.")

    scan = bundle.get("scan", {})
    seed = SeedInput(type=scan.get("seed_type", "email"), value=scan.get("normalized_seed", ""))
    created = _parse_datetime(scan.get("created_at") or scan.get("updated_at"))
    updated = _parse_datetime(scan.get("updated_at"))
    status = _scan_status(scan.get("status"), scan.get("current_stage"))

    return Scan(
        scanId=scanId,
        seed=seed,
        status=status,
        progress=int(scan.get("progress", 0)),
        createdAt=created,
        updatedAt=updated,
    )


@router.post("/scans/{scanId}/actions/stop")
async def stop_scan(
    scanId: str,
    payload: StopScanRequest,
    db: DbSession,
    service: ScanService = Depends(get_scan_service),
):
    stopped = await service.stop_scan(db, scanId, reason=payload.reason)
    return {
        "scanId": scanId,
        "status": stopped.get("status", "cancelled"),
        "currentStage": stopped.get("current_stage", "stopped_by_user"),
        "progress": int(stopped.get("progress", 0)),
    }


@router.get("/scans/{scanId}/dashboard/summary", response_model=DashboardSummary)
async def get_dashboard_summary(scanId: str, db: DbSession):
    try:
        dashboard = await _DASHBOARD_REPO.get_dashboard(db, scanId)
    except ResourceNotFoundError:
        return _api_error(404, "scan_not_found", f"Scan '{scanId}' was not found.")

    stats_by_title = {item.get("title", ""): int(item.get("value", 0)) for item in dashboard.get("stats", [])}
    stats = DashboardStats(
        brokersScanned=stats_by_title.get("Brokers Scanned", 0),
        exposuresFound=stats_by_title.get("Exposures Found", 0),
        deletionsSecured=stats_by_title.get("Deletions Secured", 0),
        activeDisputes=stats_by_title.get("Active Legal Disputes", 0),
    )

    trends = DashboardTrends(
        brokersScanned=_trend_from_value(stats.brokersScanned),
        exposuresFound=_trend_from_value(stats.exposuresFound),
        deletionsSecured=_trend_from_value(stats.deletionsSecured),
        activeDisputes=_trend_from_value(stats.activeDisputes),
    )

    threat_raw = dashboard.get("threat_breakdown", {})
    threat_counts = {
        "email": int(threat_raw.get("emails_exposed", 0)),
        "phone": int(threat_raw.get("phone_leaks", 0)),
        "location": int(threat_raw.get("location_traces", 0)),
    }
    total = max(sum(threat_counts.values()), 1)
    threat_breakdown = [
        ThreatBreakdownItem(type=key, count=value, percentOfTotal=round((value / total) * 100, 2))
        for key, value in threat_counts.items()
    ]

    return DashboardSummary(scanId=scanId, stats=stats, trends=trends, threatBreakdown=threat_breakdown)


@router.get("/scans/{scanId}/dashboard/radar-targets", response_model=RadarTargetsResponse)
async def get_radar_targets(scanId: str, db: DbSession, limit: int = Query(default=50, ge=1, le=200)):
    try:
        bundle = await _load_bundle(db, scanId)
    except ResourceNotFoundError:
        return _api_error(404, "scan_not_found", f"Scan '{scanId}' was not found.")

    targets = bundle.get("targets", [])[:limit]
    colors = {"email": "#4a6fa5", "phone": "#d17a22", "location": "#b94a48"}
    items: list[RadarTarget] = []

    for idx, target in enumerate(targets):
        threat_type = _threat_type_from_target(target, idx)
        items.append(
            RadarTarget(
                id=idx + 1,
                angle=float((35 + idx * 52) % 360),
                distance=float(min(95, 28 + idx * 9)),
                broker=str(target.get("brokerName", "Unknown Broker")),
                status=_radar_status_from_engagement(str(target.get("status", "stalling"))),
                color=colors[threat_type],
                type=threat_type,
                confidence=min(99, 62 + idx * 4),
            )
        )

    return RadarTargetsResponse(scanId=scanId, items=items)


@router.get("/scans/{scanId}/dashboard/activity-logs", response_model=ActivityLogPage)
async def get_activity_logs(
    scanId: str,
    db: DbSession,
    cursor: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    types: str | None = None,
):
    try:
        bundle = await _load_bundle(db, scanId)
    except ResourceNotFoundError:
        return _api_error(404, "scan_not_found", f"Scan '{scanId}' was not found.")

    events = list(reversed(bundle.get("events", [])))
    if types:
        allowed = {item.strip() for item in types.split(",") if item.strip()}
        events = [event for event in events if event.get("type") in allowed]

    try:
        paged_events, page_info = _paginate(events, cursor, limit)
    except ValueError:
        return _api_error(400, "invalid_cursor", "Cursor must be a numeric offset.")

    items = [
        ActivityLog(
            id=index + 1,
            type=event.get("type", "System"),
            message=str(event.get("message", "")),
            color=_activity_color(str(event.get("type", "System"))),
            createdAt=_parse_datetime(event.get("created_at")),
        )
        for index, event in enumerate(paged_events)
    ]

    return ActivityLogPage(items=items, pageInfo=page_info)


@router.get("/scans/{scanId}/dashboard/agents", response_model=AgentStatusesResponse)
async def get_dashboard_agents(scanId: str, db: DbSession):
    try:
        bundle = await _load_bundle(db, scanId)
    except ResourceNotFoundError:
        return _api_error(404, "scan_not_found", f"Scan '{scanId}' was not found.")

    agents = [
        AgentStatus(
            name=str(agent.get("name", "Agent")),
            mode=_agent_mode(str(agent.get("name", "Agent"))),
            status=str(agent.get("status", "active")).title(),
            task=str(agent.get("detail", "Processing")),
            progress=min(100, 25 + idx * 25),
        )
        for idx, agent in enumerate(build_live_agent_statuses(bundle))
    ]

    return AgentStatusesResponse(scanId=scanId, agents=agents)


@router.get("/scans/{scanId}/dashboard/pivot-chain", response_model=PivotChain)
async def get_pivot_chain(scanId: str, db: DbSession):
    try:
        bundle = await _load_bundle(db, scanId)
    except ResourceNotFoundError:
        return _api_error(404, "scan_not_found", f"Scan '{scanId}' was not found.")

    emails = [str(bundle.get("scan", {}).get("normalized_seed", ""))]
    usernames = [str(item) for item in bundle.get("usernames", [])]
    platforms = [str(item) for item in bundle.get("accounts", [])]
    brokers = [str(item.get("brokerName", "")) for item in bundle.get("targets", [])]

    columns = [
        PivotColumn(label="Emails", values=emails),
        PivotColumn(label="Usernames", values=usernames),
        PivotColumn(label="Platforms", values=platforms),
        PivotColumn(label="Brokers", values=brokers),
    ]

    edges: list[PivotEdge] = []
    for idx in range(min(len(emails), len(usernames))):
        edges.append(PivotEdge(fromColumn=0, fromIndex=idx, toColumn=1, toIndex=idx))
    for idx in range(min(len(usernames), len(platforms))):
        edges.append(PivotEdge(fromColumn=1, fromIndex=idx, toColumn=2, toIndex=idx))
    for idx in range(min(len(platforms), len(brokers))):
        edges.append(PivotEdge(fromColumn=2, fromIndex=idx, toColumn=3, toIndex=idx))

    summary = [
        PivotSummaryItem(label="Total Identities", value=len(set(usernames + emails)), max=max(1, len(usernames + emails) + 5)),
        PivotSummaryItem(label="Usernames Extracted", value=len(usernames), max=max(1, len(usernames) + 5)),
        PivotSummaryItem(label="Platforms Scanned", value=len(platforms), max=max(1, len(platforms) + 5)),
        PivotSummaryItem(label="Brokers Matched", value=len(brokers), max=max(1, len(brokers) + 5)),
    ]

    return PivotChain(scanId=scanId, columns=columns, edges=edges, summary=summary)


@router.get("/scans/{scanId}/identity-graph", response_model=IdentityGraphPayload)
async def get_identity_graph(
    scanId: str,
    db: DbSession,
    includePlatforms: bool = True,
    includeIdentity: bool = True,
    includeTargets: bool = True,
):
    try:
        bundle = await _load_bundle(db, scanId)
    except ResourceNotFoundError:
        return _api_error(404, "scan_not_found", f"Scan '{scanId}' was not found.")

    graph_payload = dict(bundle.get("graph") or {})
    all_nodes = list(graph_payload.get("nodes") or [])
    all_edges = list(graph_payload.get("edges") or [])
    if len(all_nodes) <= 1:
        fallback_graph = _fallback_identity_graph(bundle)
        all_nodes = fallback_graph["nodes"]
        all_edges = fallback_graph["edges"]

    target_names = {
        str(target.get("brokerName") or "").strip()
        for target in (bundle.get("targets") or [])
        if isinstance(target, dict) and str(target.get("brokerName") or "").strip()
    }
    if target_names:
        all_nodes = [
            node
            for node in all_nodes
            if str(node.get("type") or "") != "target" or str(node.get("label") or "").strip() in target_names
        ]
    else:
        all_nodes = [node for node in all_nodes if str(node.get("type") or "") != "target"]

    existing_target_labels = {
        str(node.get("label") or "").strip()
        for node in all_nodes
        if str(node.get("type") or "") == "target"
    }
    identity_anchor = next(
        (str(node.get("id") or "") for node in all_nodes if str(node.get("type") or "") == "identity"),
        "seed",
    )
    for index, broker_name in enumerate(sorted(target_names - existing_target_labels), start=1):
        node_id = f"target_dynamic_{index}"
        all_nodes.append(
            {
                "id": node_id,
                "type": "target",
                "label": broker_name,
                "x": 140 + ((index - 1) * 90),
                "y": 585,
                "data": {"status": "Discovered broker target", "details": ["Matched from live scan results"]},
            }
        )
        all_edges.append({"source": identity_anchor or "seed", "target": node_id, "relationship": "found_on_broker"})

    def include_node(node_type: str) -> bool:
        if node_type == "platform":
            return includePlatforms
        if node_type in {"identity", "username", "seed"}:
            return includeIdentity
        if node_type == "target":
            return includeTargets
        return True

    edge_pairs = [(str(edge.get("source", "")), str(edge.get("target", ""))) for edge in all_edges]
    allowed_nodes = [node for node in all_nodes if include_node(str(node.get("type", "")))]
    allowed_ids = {str(node.get("id", "")) for node in allowed_nodes}

    nodes: list[IdentityGraphNode] = []
    for idx, node in enumerate(allowed_nodes):
        node_id = str(node.get("id", ""))
        connections = [
            right if left == node_id else left
            for left, right in edge_pairs
            if (left == node_id or right == node_id) and left in allowed_ids and right in allowed_ids
        ]

        nodes.append(
            IdentityGraphNode(
                id=node_id,
                type=str(node.get("type", "identity")),
                label=str(node.get("label", node_id)),
                x=float(node.get("x", 0)),
                y=float(node.get("y", 0)),
                connections=connections,
                revealStep=idx,
                data=node.get("data") or None,
            )
        )

    edges = [
        IdentityGraphEdge(fromNodeId=left, toNodeId=right)
        for left, right in edge_pairs
        if left in allowed_ids and right in allowed_ids
    ]

    return IdentityGraphPayload(
        scanId=scanId,
        nodes=nodes,
        edges=edges,
        filters=IdentityGraphFilters(
            showPlatforms=includePlatforms,
            showIdentity=includeIdentity,
            showTargets=includeTargets,
        ),
    )


@router.get("/scans/{scanId}/identity-graph/nodes/{nodeId}", response_model=IdentityGraphNode)
async def get_identity_graph_node(scanId: str, nodeId: str, db: DbSession):
    graph = await get_identity_graph(scanId, db)
    if isinstance(graph, JSONResponse):
        return graph

    for node in graph.nodes:
        if node.id == nodeId:
            return node

    return _api_error(404, "node_not_found", f"Node '{nodeId}' was not found for scan '{scanId}'.")


@router.get("/scans/{scanId}/war-room/engagements")
async def list_engagements(
    scanId: str,
    db: DbSession,
    statuses: str | None = None,
    cursor: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
):
    try:
        bundle = await _load_bundle(db, scanId)
    except ResourceNotFoundError:
        return _api_error(404, "scan_not_found", f"Scan '{scanId}' was not found.")

    items = [
        EngagementSummary(
            id=str(target.get("id")),
            brokerName=str(target.get("brokerName", "Unknown Broker")),
            status=_engagement_status(str(target.get("status", "stalling"))),
            lastActivity=str(target.get("lastActivity", "unknown")),
            messageCount=int(target.get("messageCount", 0))
            + len(_MANUAL_MESSAGES.get((scanId, str(target.get("id"))), [])),
        )
        for target in bundle.get("targets", [])
    ]

    if statuses:
        allowed = {item.strip() for item in statuses.split(",") if item.strip()}
        items = [item for item in items if item.status in allowed]

    try:
        paged_items, page_info = _paginate(items, cursor, limit)
    except ValueError:
        return _api_error(400, "invalid_cursor", "Cursor must be a numeric offset.")

    return {
        "scanId": scanId,
        "items": [item.model_dump(mode="json") for item in paged_items],
        "pageInfo": page_info.model_dump(mode="json"),
    }


@router.get("/scans/{scanId}/war-room/engagements/{engagementId}", response_model=EngagementDetail)
async def get_engagement(scanId: str, engagementId: str, db: DbSession):
    try:
        bundle = await _load_bundle(db, scanId)
    except ResourceNotFoundError:
        return _api_error(404, "scan_not_found", f"Scan '{scanId}' was not found.")

    target = next((item for item in bundle.get("targets", []) if item.get("id") == engagementId), None)
    if target is None:
        return _api_error(404, "engagement_not_found", f"Engagement '{engagementId}' was not found.")

    thread = bundle.get("threads", {}).get(engagementId, {})
    messages = [
        EngagementMessage(
            id=str(message.get("id")),
            type=str(message.get("type", "system")),
            content=str(message.get("content", "")),
            timestamp=str(message.get("timestamp", "")),
            metadata=_message_metadata(message.get("metadata")),
        )
        for message in thread.get("messages", [])
    ]

    messages.extend(_MANUAL_MESSAGES.get((scanId, engagementId), []))

    return EngagementDetail(
        id=str(target.get("id")),
        brokerName=str(target.get("brokerName", "Unknown Broker")),
        status=_engagement_status(str(target.get("status", "stalling"))),
        lastActivity=str(target.get("lastActivity", "unknown")),
        messageCount=int(target.get("messageCount", len(messages))),
        conversation=messages,
    )


@router.get("/scans/{scanId}/war-room/engagements/{engagementId}/messages", response_model=MessagePage)
async def list_engagement_messages(
    scanId: str,
    engagementId: str,
    db: DbSession,
    cursor: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
):
    detail = await get_engagement(scanId, engagementId, db)
    if isinstance(detail, JSONResponse):
        return detail

    messages = list(reversed(detail.conversation))
    try:
        paged_messages, page_info = _paginate(messages, cursor, limit)
    except ValueError:
        return _api_error(400, "invalid_cursor", "Cursor must be a numeric offset.")

    return MessagePage(items=paged_messages, pageInfo=page_info)


@router.post(
    "/scans/{scanId}/war-room/engagements/{engagementId}/messages",
    response_model=EngagementMessage,
    status_code=201,
)
async def create_engagement_message(
    scanId: str,
    engagementId: str,
    payload: CreateMessageRequest,
    db: DbSession,
):
    content = payload.content.strip()
    if not content:
        return _api_error(400, "invalid_message", "Message content cannot be empty.")

    timestamp = _now_utc().isoformat().replace("+00:00", "Z")
    message = EngagementMessage(
        id=f"msg_{secrets.token_hex(6)}",
        type=payload.type,
        content=content,
        timestamp=timestamp,
        metadata=payload.metadata,
    )

    if db is None:
        bundle = memory_store._scans.get(scanId)  # noqa: SLF001
        if bundle is None:
            return _api_error(404, "scan_not_found", f"Scan '{scanId}' was not found.")

        target = next((item for item in bundle.get("targets", []) if item.get("id") == engagementId), None)
        if target is None:
            return _api_error(404, "engagement_not_found", f"Engagement '{engagementId}' was not found.")

        threads = bundle.setdefault("threads", {})
        thread = threads.setdefault(engagementId, {"messages": []})
        thread.setdefault("messages", []).append(message.model_dump(mode="json", exclude_none=True))

        target["lastActivity"] = "just now"
        target["messageCount"] = int(target.get("messageCount", 0)) + 1

        memory_store._scans[scanId] = bundle  # noqa: SLF001
    else:
        if payload.type != "agent":
            target = await db.get(BrokerCase, engagementId)
            if target is None or target.scan_job_id != scanId:
                return _api_error(404, "engagement_not_found", f"Engagement '{engagementId}' was not found.")
            target.last_activity_label = "just now"
            await db.commit()
            _MANUAL_MESSAGES.setdefault((scanId, engagementId), []).append(message)
            return message

        try:
            target, _seed_value, gmail_thread_id, existing_subject, reply_to_message_id = await _load_dispatch_context(
                db, scanId, engagementId
            )
        except ResourceNotFoundError:
            return _api_error(404, "engagement_not_found", f"Engagement '{engagementId}' was not found.")

        recipient, invalid_reason = resolve_dispatch_recipient(target.broker_name)
        if not recipient:
            return _api_error(
                409,
                "invalid_broker_contact",
                f"Cannot send message to {target.broker_name}: invalid or unverified broker contact ({invalid_reason}).",
            )

        broker_name = target.broker_name
        subject = existing_subject or f"Data Deletion Request - {target.broker_name}"
        if gmail_thread_id and not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"

        try:
            dispatch_result = await dispatch_notice(
                session=db,
                broker_case_id=engagementId,
                to_email=recipient,
                subject=subject,
                body=content,
                thread_id=gmail_thread_id,
                in_reply_to_message_id=reply_to_message_id,
                last_activity_label="Manual reply sent",
            )
        except Exception as exc:
            logger.exception(
                "war_room_manual_reply_dispatch_failed",
                scan_id=scanId,
                engagement_id=engagementId,
                broker_name=broker_name,
                error=str(exc),
            )
            await db.rollback()
            return _api_error(502, "message_dispatch_failed", "Failed to dispatch outbound message.")

        db.add(
            ActivityEvent(
                id=new_id("evt"),
                scan_job_id=scanId,
                event_type="Comm",
                message=f"Manual reply sent to {broker_name}.",
                payload={
                    "stage": "war_room_manual_reply",
                    "broker_name": broker_name,
                    "engagement_id": engagementId,
                },
            )
        )
        await db.commit()
        await publish(
            f"scan:{scanId}",
            {
                "type": "warroom.message_sent",
                "scan_id": scanId,
                "engagement_id": engagementId,
                "broker_name": broker_name,
            },
        )

        return EngagementMessage(
            id=str(dispatch_result.get("local_message_id") or message.id),
            type="agent",
            content=content,
            timestamp=str(dispatch_result.get("display_timestamp") or timestamp),
            metadata=payload.metadata,
        )

    return message


def _escalation_status(reason_code: str) -> str:
    if reason_code in {"illegal_request", "non_compliance"}:
        return "illegal"
    return "stalling"


def _is_gmail_thread_id(thread_id: str | None) -> bool:
    if not thread_id:
        return False
    value = str(thread_id).strip()
    if not value:
        return False
    if value.startswith("thread_") or "_" in value:
        return False
    return len(value) >= 10


def _escalation_reason_text(reason_code: str) -> str:
    if reason_code == "illegal_request":
        return "Your prior response requested excessive or unlawful identity artifacts."
    if reason_code == "excessive_delay":
        return "You have not responded within a reasonable compliance window."
    if reason_code == "partial_compliance":
        return "Your prior response only partially addressed the deletion request."
    return "You have failed to comply with the prior deletion request."


async def _load_dispatch_context(
    db, scan_id: str, engagement_id: str
) -> tuple[BrokerCase, str, str | None, str | None, str | None]:
    target = await db.get(BrokerCase, engagement_id)
    if target is None or target.scan_job_id != scan_id:
        raise ResourceNotFoundError(f"Engagement '{engagement_id}' was not found.")

    scan = await db.get(ScanJob, scan_id)
    seed = await db.get(Seed, scan.seed_id) if scan is not None and scan.seed_id else None
    seed_value = seed.normalized_value if seed is not None else ""

    thread_result = await db.execute(
        select(EmailThread).where(EmailThread.broker_case_id == engagement_id)
    )
    thread = thread_result.scalars().first()

    gmail_thread_id = thread.external_thread_id if thread and _is_gmail_thread_id(thread.external_thread_id) else None
    subject = thread.subject if thread and thread.subject else None

    reply_to_message_id: str | None = None
    if thread is not None:
        message_result = await db.execute(
            select(EmailMessage)
            .where(EmailMessage.thread_id == thread.id, EmailMessage.direction == "broker")
            .order_by(EmailMessage.created_at.desc())
        )
        latest_broker_message = message_result.scalars().first()
        if latest_broker_message is not None:
            metadata = latest_broker_message.metadata_json or {}
            reply_to_message_id = (
                metadata.get("rfc_message_id")
                or metadata.get("reply_to_message_id")
                or metadata.get("in_reply_to_message_id")
            )
            if reply_to_message_id is not None:
                reply_to_message_id = str(reply_to_message_id)

    return target, seed_value, gmail_thread_id, subject, reply_to_message_id


def _build_escalation_notice(
    broker_name: str,
    jurisdiction: str,
    seed_value: str,
    note: str,
    reason_code: str,
) -> str:
    base_notice = build_notice(
        jurisdiction=jurisdiction,
        seed=seed_value,
        identity={"name": None, "location": None},
        broker_name=broker_name,
    )
    reason_text = _escalation_reason_text(reason_code)
    operator_note = note.strip()
    escalation_note = (
        f"\n\nEscalation notice:\n"
        f"{reason_text}\n"
        "This message is a formal escalation of the existing deletion request, and all previous deadlines remain in force."
    )
    if operator_note:
        escalation_note += f"\n\nOperator note: {operator_note}"
    escalation_note += (
        "\n\nIf this request is not completed promptly, the matter will be preserved for regulatory complaint and further legal action."
    )
    return f"{base_notice}{escalation_note}"


@router.post(
    "/scans/{scanId}/war-room/engagements/{engagementId}/actions/escalate",
    response_model=EscalateEngagementResponse,
    status_code=202,
)
async def escalate_engagement(
    scanId: str,
    engagementId: str,
    payload: EscalateEngagementRequest,
    db: DbSession,
):
    status = _escalation_status(payload.reasonCode)

    if db is None:
        bundle = memory_store._scans.get(scanId)  # noqa: SLF001
        if bundle is None:
            return _api_error(404, "scan_not_found", f"Scan '{scanId}' was not found.")

        updated = False
        for target in bundle.get("targets", []):
            if target.get("id") == engagementId:
                target["status"] = status
                target["lastActivity"] = "just now"
                updated = True
                break
        if not updated:
            return _api_error(404, "engagement_not_found", f"Engagement '{engagementId}' was not found.")

        thread = bundle.get("threads", {}).get(engagementId)
        if thread is not None:
            thread["status"] = status
            thread.setdefault("messages", []).append(
                {
                    "id": f"msg_{secrets.token_hex(6)}",
                    "type": "system",
                    "content": f"Escalation queued: {payload.reasonCode}",
                    "timestamp": "now",
                    "metadata": {"classification": "Warning", "legalCitation": payload.legalFramework},
                }
            )

        memory_store._scans[scanId] = bundle  # noqa: SLF001
    else:
        try:
            target, seed_value, gmail_thread_id, existing_subject, reply_to_message_id = await _load_dispatch_context(
                db, scanId, engagementId
            )
        except ResourceNotFoundError:
            return _api_error(404, "engagement_not_found", f"Engagement '{engagementId}' was not found.")

        recipient, invalid_reason = resolve_dispatch_recipient(target.broker_name)
        if not recipient:
            return _api_error(
                409,
                "invalid_broker_contact",
                f"Cannot escalate {target.broker_name}: invalid or unverified broker contact ({invalid_reason}).",
            )

        jurisdiction = payload.legalFramework or target.jurisdiction or "DPDP"
        subject = existing_subject or f"Data Deletion Request - {target.broker_name}"
        if gmail_thread_id and not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"

        body = _build_escalation_notice(
            broker_name=target.broker_name,
            jurisdiction=jurisdiction,
            seed_value=seed_value,
            note=payload.note,
            reason_code=payload.reasonCode,
        )

        legal_request = LegalRequest(
            id=new_id("legal"),
            broker_case_id=engagementId,
            channel="email",
            subject=subject,
            body=body,
            citations=build_citations(jurisdiction),
            status="queued",
        )
        db.add(legal_request)
        db.add(
            ActivityEvent(
                id=new_id("evt"),
                scan_job_id=scanId,
                event_type="Legal",
                message=f"Escalation dispatched to {target.broker_name}.",
                payload={
                    "stage": "war_room_escalation",
                    "broker_name": target.broker_name,
                    "engagement_id": engagementId,
                    "reason_code": payload.reasonCode,
                    "legal_framework": jurisdiction,
                },
            )
        )

        try:
            await dispatch_notice(
                session=db,
                broker_case_id=engagementId,
                to_email=recipient,
                subject=subject,
                body=body,
                thread_id=gmail_thread_id,
                in_reply_to_message_id=reply_to_message_id,
            )
        except Exception as exc:
            logger.exception(
                "war_room_escalation_dispatch_failed",
                scan_id=scanId,
                engagement_id=engagementId,
                broker_name=target.broker_name,
                error=str(exc),
            )
            await db.rollback()
            return _api_error(502, "escalation_dispatch_failed", "Failed to dispatch escalation notice.")

        legal_request.status = "dispatched"
        target.status = status
        target.jurisdiction = jurisdiction
        target.last_activity_label = "Escalation dispatched"
        await db.commit()
        await publish(
            f"scan:{scanId}",
            {
                "type": "warroom.escalation_dispatched",
                "scan_id": scanId,
                "engagement_id": engagementId,
                "broker_name": target.broker_name,
                "reason_code": payload.reasonCode,
            },
        )

    return EscalateEngagementResponse(
        accepted=True,
        engagementId=engagementId,
        queuedAt=_now_utc(),
    )
