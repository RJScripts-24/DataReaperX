from __future__ import annotations

from pydantic import BaseModel, Field


class GraphNodeSchema(BaseModel):
    id: str
    type: str
    label: str
    x: float
    y: float
    data: dict = Field(default_factory=dict)


class GraphEdgeSchema(BaseModel):
    source: str
    target: str
    relationship: str


class ReconGraphResponse(BaseModel):
    scan_id: str
    nodes: list[GraphNodeSchema]
    edges: list[GraphEdgeSchema]
