from __future__ import annotations

from pydantic import BaseModel, Field


class BattleMessageSchema(BaseModel):
    id: str
    type: str
    content: str
    timestamp: str
    metadata: dict = Field(default_factory=dict)


class BattleThreadSchema(BaseModel):
    target_id: str
    broker_name: str
    status: str
    deadline_remaining: str | None = None
    messages: list[BattleMessageSchema]


class WarRoomResponse(BaseModel):
    scan_id: str
    targets: list[dict]
    selected_thread: BattleThreadSchema | None = None
