"""Pydantic models for the DataReaper frontend integration contract (/v1 API)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

SeedType = Literal["email", "phone"]
ScanStatus = Literal[
    "queued",
    "discovering",
    "identifying",
    "engaging",
    "stabilizing",
    "completed",
    "cancelled",
    "failed",
]
ThreatType = Literal["email", "phone", "location"]
MessageType = Literal["broker", "agent", "system"]
ActivityLogType = Literal["System", "Scan", "Match", "Legal", "Comm"]
EngagementStatus = Literal["resolved", "stalling", "illegal", "in-progress"]
GraphNodeType = Literal["seed", "platform", "username", "identity", "target"]
AgentMode = Literal["SLEUTH", "LEGAL", "COMMS", "DELETION"]


class ApiError(BaseModel):
    code: str
    message: str
    details: list[dict[str, Any]] | None = None


class CreateSessionClient(BaseModel):
    appVersion: str
    platform: str
    timezone: str | None = None
    locale: str | None = None


class CreateSessionRequest(BaseModel):
    client: CreateSessionClient


class CreateSessionResponse(BaseModel):
    sessionId: str
    expiresAt: datetime


class SeedInput(BaseModel):
    type: SeedType
    value: str
    countryCode: str | None = None


class CreateScanRequest(BaseModel):
    seed: SeedInput
    locale: str | None = None
    jurisdictionHint: Literal["DPDP", "GDPR", "CCPA", "AUTO"] = "AUTO"


class RouteHints(BaseModel):
    commandCenter: str = "/command-center"
    identityGraph: str = "/identity-graph"
    warRoom: str = "/war-room"


class CreateScanResponse(BaseModel):
    scanId: str
    status: ScanStatus
    startedAt: datetime
    routeHints: RouteHints
    estimatedDuration: int | None = None


class Scan(BaseModel):
    scanId: str
    seed: SeedInput
    status: ScanStatus
    progress: int = Field(ge=0, le=100)
    createdAt: datetime
    updatedAt: datetime
    failureReason: str | None = None


class DashboardStats(BaseModel):
    brokersScanned: int
    exposuresFound: int
    deletionsSecured: int
    activeDisputes: int


class DashboardTrends(BaseModel):
    brokersScanned: list[int]
    exposuresFound: list[int]
    deletionsSecured: list[int]
    activeDisputes: list[int]


class ThreatBreakdownItem(BaseModel):
    type: ThreatType
    count: int
    percentOfTotal: float


class DashboardSummary(BaseModel):
    scanId: str
    stats: DashboardStats
    trends: DashboardTrends
    threatBreakdown: list[ThreatBreakdownItem]


class RadarTarget(BaseModel):
    id: int
    angle: float
    distance: float
    broker: str
    status: Literal["Scanning", "Identified", "Deletion in progress"]
    color: str
    type: ThreatType
    confidence: int


class RadarTargetsResponse(BaseModel):
    scanId: str
    items: list[RadarTarget]


class ActivityLog(BaseModel):
    id: int
    type: ActivityLogType
    message: str
    color: str
    createdAt: datetime


class PageInfo(BaseModel):
    nextCursor: str | None = None
    hasMore: bool


class ActivityLogPage(BaseModel):
    items: list[ActivityLog]
    pageInfo: PageInfo


class AgentStatus(BaseModel):
    name: str
    mode: AgentMode
    status: str
    task: str
    progress: int


class AgentStatusesResponse(BaseModel):
    scanId: str
    agents: list[AgentStatus]


class PivotColumn(BaseModel):
    label: Literal["Emails", "Usernames", "Platforms", "Brokers"]
    values: list[str]


class PivotEdge(BaseModel):
    fromColumn: int
    fromIndex: int
    toColumn: int
    toIndex: int


class PivotSummaryItem(BaseModel):
    label: str
    value: int
    max: int


class PivotChain(BaseModel):
    scanId: str
    columns: list[PivotColumn]
    edges: list[PivotEdge]
    summary: list[PivotSummaryItem]


class IdentityNodeData(BaseModel):
    platform: str | None = None
    value: str | None = None
    status: str | None = None
    details: list[str] | None = None


class IdentityGraphNode(BaseModel):
    id: str
    type: GraphNodeType
    label: str
    x: float
    y: float
    connections: list[str]
    revealStep: int | None = None
    data: IdentityNodeData | None = None


class IdentityGraphEdge(BaseModel):
    fromNodeId: str
    toNodeId: str


class IdentityGraphFilters(BaseModel):
    showPlatforms: bool
    showIdentity: bool
    showTargets: bool


class IdentityGraphPayload(BaseModel):
    scanId: str
    nodes: list[IdentityGraphNode]
    edges: list[IdentityGraphEdge]
    filters: IdentityGraphFilters


class EngagementSummary(BaseModel):
    id: str
    brokerName: str
    status: EngagementStatus
    lastActivity: str
    messageCount: int


class MessageMetadata(BaseModel):
    classification: str | None = None
    legalCitation: str | None = None
    explanation: str | None = None


class EngagementMessage(BaseModel):
    id: str
    type: MessageType
    content: str
    timestamp: str
    metadata: MessageMetadata | None = None


class EngagementDetail(EngagementSummary):
    conversation: list[EngagementMessage]


class MessagePage(BaseModel):
    items: list[EngagementMessage]
    pageInfo: PageInfo


class CreateMessageRequest(BaseModel):
    type: Literal["agent", "system"]
    content: str
    metadata: MessageMetadata | None = None


class EscalateEngagementRequest(BaseModel):
    reasonCode: Literal[
        "illegal_request",
        "excessive_delay",
        "non_compliance",
        "partial_compliance",
    ]
    note: str
    legalFramework: Literal["DPDP", "GDPR", "CCPA"] = "DPDP"


class EscalateEngagementResponse(BaseModel):
    accepted: Literal[True]
    engagementId: str
    queuedAt: datetime


class ResourceCard(BaseModel):
    id: str
    tag: str
    title: str
    imageUrl: str
    href: str


class ResourceCardListResponse(BaseModel):
    items: list[ResourceCard]


class CreateRealtimeConnectionRequest(BaseModel):
    scanId: str
    channels: list[
        Literal[
            "dashboard.summary",
            "dashboard.radar",
            "dashboard.activity",
            "dashboard.agents",
            "identity.graph",
            "warroom.engagements",
            "warroom.messages",
            "scans.lifecycle",
        ]
    ]
    preferredTransport: Literal["websocket", "sse"] = "websocket"


class CreateRealtimeConnectionResponse(BaseModel):
    connectionId: str
    transport: Literal["websocket", "sse"]
    endpoint: str
    token: str
    expiresAt: datetime


class RealtimeEventEnvelope(BaseModel):
    event: Literal[
        "scans.lifecycle.updated",
        "dashboard.summary.updated",
        "dashboard.radar.target_detected",
        "dashboard.activity.log_added",
        "dashboard.agent.updated",
        "identity.graph.node_added",
        "identity.graph.edge_added",
        "warroom.engagement.updated",
        "warroom.message.added",
    ]
    occurredAt: datetime
    scanId: str
    payload: dict[str, Any]
