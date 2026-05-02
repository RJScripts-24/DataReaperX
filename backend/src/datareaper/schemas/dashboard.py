from __future__ import annotations

from pydantic import BaseModel


class StatCard(BaseModel):
    title: str
    value: int
    delta: int = 0
    label: str


class RadarTarget(BaseModel):
    id: str
    broker: str
    status: str
    angle: float
    distance: float
    severity: str


class ActivityLogItem(BaseModel):
    id: str
    type: str
    message: str
    created_at: str


class AgentStatus(BaseModel):
    name: str
    status: str
    detail: str


class DashboardResponse(BaseModel):
    scan_id: str
    stats: list[StatCard]
    threat_breakdown: dict[str, int]
    radar_targets: list[RadarTarget]
    activity_feed: list[ActivityLogItem]
    agent_statuses: list[AgentStatus]
